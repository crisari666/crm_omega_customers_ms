import { Injectable, Inject, forwardRef, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { IngestVoiceCallEventDto } from './dto/ingest-voice-call-event.dto';
import { ListCallLogsAdminQueryDto } from './dto/list-call-logs-admin.query.dto';
import { SaveCallTranscriptionDto } from './dto/save-call-transcription.dto';
import {
  CustomerCallLog,
  CustomerCallLogDocument,
  CustomerCallUtterance,
} from './schemas/customer-call-log.schema';
import {
  callOutcomeMatchesFilter,
  deriveResolvedCallOutcome,
} from './utils/call-log-outcome.util';
import {
  buildGoogleMeetCallSid,
  extractGoogleMeetingCode,
} from './utils/google-meet-call-log.util';
import { CustomerEventsService } from './customer-events.service';
import {
  type CustomerCallLogAdminItemDto,
  type IngestResult,
} from './types/customer-call-logs.type';
import { CustomerCallAuditService } from './call-audit/customer-call-audit.service';
import type { SyncVentorMeetCallDto } from './dto/sync-ventor-meet-call.dto';
import { GoogleMeetArtifactsService } from './google-meet-artifacts.service';

const ADMIN_LIST_FETCH_CAP = 5000;
const GOOGLE_MEET_PROVIDER = 'google_meet' as const;

@Injectable()
export class CustomerCallLogsService {
  constructor(
    @InjectModel(CustomerCallLog.name)
    private readonly customerCallLogModel: Model<CustomerCallLogDocument>,
    private readonly customerEventsService: CustomerEventsService,
    @Inject(forwardRef(() => CustomerCallAuditService))
    private readonly customerCallAuditService: CustomerCallAuditService,
    private readonly googleMeetArtifactsService: GoogleMeetArtifactsService,
  ) {}

  async ingestVoiceCallEvent(payload: IngestVoiceCallEventDto): Promise<IngestResult> {
    await this.createOrUpdateCallHeader(payload);
    await this.appendOrUpdateEvent(payload);
    return {
      accepted: true,
      callSid: payload.callSid,
      eventType: payload.eventType,
      ...(payload.customerExternalRef !== undefined
        ? { customerId: payload.customerExternalRef }
        : {}),
    };
  }

  async createVoiceCall(payload: IngestVoiceCallEventDto): Promise<IngestResult> {
    await this.createOrUpdateCallHeader(payload);
    console.log('createVoiceCall', JSON.stringify(payload, null, 2));
    if (payload.customerExternalRef?.trim()) {
      await this.customerEventsService.createCallCrmEvent({
        customerRef: payload.customerExternalRef,
        callSid: payload.callSid,
        userId: payload.agentExternalRef,
      });
    }
    return {
      accepted: true,
      callSid: payload.callSid,
      eventType: payload.eventType,
      ...(payload.customerExternalRef !== undefined
        ? { customerId: payload.customerExternalRef }
        : {}),
    };
  }

  async appendVoiceCallEvent(payload: IngestVoiceCallEventDto): Promise<IngestResult> {
    await this.ensureCallExists(payload.callSid);
    await this.updateCallHeaderTranscription(
      payload.callSid,
      payload.transcript,
      payload.text,
      payload.utterances,
      payload.recordingUrl,
    );
    await this.appendOrUpdateEvent(payload);
    return {
      accepted: true,
      callSid: payload.callSid,
      eventType: payload.eventType,
      ...(payload.customerExternalRef !== undefined
        ? { customerId: payload.customerExternalRef }
        : {}),
    };
  }

  /**
   * Upserts a Meet call-log stub when a ventor schedules a virtual Meet.
   */
  async createGoogleMeetScheduleLog(args: {
    readonly scheduleEventId: string;
    readonly customerId: string;
    readonly agentUserId: string;
    readonly scheduledAt: Date;
    readonly googleMeetUrl: string;
    readonly googleCalendarEventId?: string;
    readonly organizerEmail?: string;
  }): Promise<{ callSid: string }> {
    const callSid = buildGoogleMeetCallSid({
      googleCalendarEventId: args.googleCalendarEventId,
      scheduleEventId: args.scheduleEventId,
    });
    const meetingCode = extractGoogleMeetingCode(args.googleMeetUrl);
    const metadata: Record<string, unknown> = {
      channel: 'meet',
      googleMeetUrl: args.googleMeetUrl,
      ventorScheduleEventId: args.scheduleEventId,
      scheduledAt: args.scheduledAt.toISOString(),
    };
    if (args.googleCalendarEventId?.trim()) {
      metadata.googleCalendarEventId = args.googleCalendarEventId.trim();
    }
    if (meetingCode) {
      metadata.meetingCode = meetingCode;
    }
    if (args.organizerEmail?.trim()) {
      metadata.organizerEmail = args.organizerEmail.trim().toLowerCase();
    }
    const customerOid = Types.ObjectId.isValid(args.customerId)
      ? new Types.ObjectId(args.customerId)
      : undefined;
    await this.customerCallLogModel
      .updateOne(
        { callSid },
        {
          $setOnInsert: {
            callSid,
            events: [
              {
                eventType: 'scheduled',
                timestamp: args.scheduledAt,
                status: 'scheduled',
              },
            ],
          },
          $set: {
            provider: GOOGLE_MEET_PROVIDER,
            direction: 'outbound',
            status: 'scheduled',
            agentExternalRef: args.agentUserId,
            ...(customerOid ? { customerId: customerOid } : {}),
            customerExternalRef: args.customerId,
            metadata,
          },
        },
        { upsert: true },
      )
      .exec();
    return { callSid };
  }

  /**
   * Applies Meet attendance + optional transcript after ventor marks visit Done.
   */
  async applyGoogleMeetSync(args: {
    readonly scheduleEventId: string;
    readonly agentUserId: string;
    readonly body: SyncVentorMeetCallDto;
  }): Promise<CustomerCallLogAdminItemDto> {
    const scheduleId = args.scheduleEventId.trim();
    const doc = await this.customerCallLogModel
      .findOne({
        provider: GOOGLE_MEET_PROVIDER,
        'metadata.ventorScheduleEventId': scheduleId,
        agentExternalRef: args.agentUserId,
      })
      .exec();
    if (!doc) {
      throw new NotFoundException('Google Meet call log not found for schedule');
    }
    const endedAt = args.body.endedAt
      ? new Date(args.body.endedAt)
      : new Date();
    if (args.body.attendance === 'attended') {
      const transcript =
        args.body.transcript?.trim() || args.body.text?.trim() || undefined;
      const text = args.body.text?.trim() || transcript;
      doc.status = 'completed';
      if (typeof args.body.durationSeconds === 'number') {
        doc.durationSeconds = args.body.durationSeconds;
      }
      if (transcript) {
        doc.transcript = transcript;
      }
      if (text) {
        doc.text = text;
      }
      if (args.body.utterances?.length) {
        doc.utterances = args.body.utterances.map((u) => ({
          speaker: u.speaker,
          text: u.text,
          start: u.start,
          end: u.end,
        }));
      }
      doc.metadata = {
        ...(doc.metadata ?? {}),
        ...(args.body.conferenceRecordName
          ? { conferenceRecordName: args.body.conferenceRecordName }
          : {}),
        meetSyncedAt: new Date().toISOString(),
        meetAttendance: 'attended',
      };
      this.pushUniqueEvent(doc, {
        eventType: 'answered',
        timestamp: endedAt,
        status: 'answered',
        durationSeconds: args.body.durationSeconds,
      });
      this.pushUniqueEvent(doc, {
        eventType: 'completed',
        timestamp: endedAt,
        status: 'completed',
        durationSeconds: args.body.durationSeconds,
      });
    } else {
      doc.status = 'no-answer';
      doc.metadata = {
        ...(doc.metadata ?? {}),
        meetSyncedAt: new Date().toISOString(),
        meetAttendance: 'no_answer',
      };
      this.pushUniqueEvent(doc, {
        eventType: 'no-answer',
        timestamp: endedAt,
        status: 'no-answer',
      });
      this.pushUniqueEvent(doc, {
        eventType: 'completed',
        timestamp: endedAt,
        status: 'no-answer',
      });
    }
    await doc.save();
    return this.toAdminItem(doc.toObject({ virtuals: true }));
  }

  /**
   * Admin: re-fetch Meet conference + transcript via SA domain-wide delegation.
   */
  async refetchGoogleMeetTranscript(
    callLogId: string,
  ): Promise<CustomerCallLogAdminItemDto> {
    if (!Types.ObjectId.isValid(callLogId)) {
      throw new NotFoundException('Call log not found');
    }
    const doc = await this.customerCallLogModel.findById(callLogId).exec();
    if (!doc) {
      throw new NotFoundException('Call log not found');
    }
    if (doc.provider !== GOOGLE_MEET_PROVIDER) {
      throw new BadRequestException('Call log is not a Google Meet record');
    }
    const meetUrl =
      typeof doc.metadata?.googleMeetUrl === 'string'
        ? doc.metadata.googleMeetUrl.trim()
        : '';
    if (!meetUrl) {
      throw new BadRequestException('Call log has no Google Meet URL');
    }
    const organizerFromMeta =
      typeof doc.metadata?.organizerEmail === 'string'
        ? doc.metadata.organizerEmail.trim()
        : '';
    const fallbackSubject =
      process.env.GOOGLE_MEET_IMPERSONATE_SUBJECT?.trim() || '';
    const organizerEmail = organizerFromMeta || fallbackSubject;
    if (!organizerEmail) {
      throw new BadRequestException(
        'Missing Meet organizer email on call log and GOOGLE_MEET_IMPERSONATE_SUBJECT',
      );
    }
    const sync = await this.googleMeetArtifactsService.fetchTranscriptByMeetUrl({
      googleMeetUrl: meetUrl,
      organizerEmail,
    });
    const scheduleEventId =
      typeof doc.metadata?.ventorScheduleEventId === 'string'
        ? doc.metadata.ventorScheduleEventId
        : '';
    if (scheduleEventId && doc.agentExternalRef) {
      return this.applyGoogleMeetSync({
        scheduleEventId,
        agentUserId: doc.agentExternalRef,
        body: {
          attendance: sync.attendance,
          conferenceRecordName: sync.conferenceRecordName,
          durationSeconds: sync.durationSeconds,
          transcript: sync.transcript,
          text: sync.text,
          utterances: sync.utterances,
          endedAt: sync.endedAt,
        },
      });
    }
    return this.applyMeetSyncToDocument(doc, sync);
  }

  private async applyMeetSyncToDocument(
    doc: CustomerCallLogDocument,
    body: SyncVentorMeetCallDto,
  ): Promise<CustomerCallLogAdminItemDto> {
    const endedAt = body.endedAt ? new Date(body.endedAt) : new Date();
    if (body.attendance === 'attended') {
      const transcript = body.transcript?.trim() || body.text?.trim() || undefined;
      const text = body.text?.trim() || transcript;
      doc.status = 'completed';
      if (typeof body.durationSeconds === 'number') {
        doc.durationSeconds = body.durationSeconds;
      }
      if (transcript) {
        doc.transcript = transcript;
      }
      if (text) {
        doc.text = text;
      }
      if (body.utterances?.length) {
        doc.utterances = body.utterances.map((u) => ({
          speaker: u.speaker,
          text: u.text,
          start: u.start,
          end: u.end,
        }));
      }
      doc.metadata = {
        ...(doc.metadata ?? {}),
        ...(body.conferenceRecordName
          ? { conferenceRecordName: body.conferenceRecordName }
          : {}),
        meetSyncedAt: new Date().toISOString(),
        meetAttendance: 'attended',
      };
      this.pushUniqueEvent(doc, {
        eventType: 'answered',
        timestamp: endedAt,
        status: 'answered',
        durationSeconds: body.durationSeconds,
      });
      this.pushUniqueEvent(doc, {
        eventType: 'completed',
        timestamp: endedAt,
        status: 'completed',
        durationSeconds: body.durationSeconds,
      });
    } else {
      doc.status = 'no-answer';
      doc.metadata = {
        ...(doc.metadata ?? {}),
        meetSyncedAt: new Date().toISOString(),
        meetAttendance: 'no_answer',
      };
      this.pushUniqueEvent(doc, {
        eventType: 'no-answer',
        timestamp: endedAt,
        status: 'no-answer',
      });
      this.pushUniqueEvent(doc, {
        eventType: 'completed',
        timestamp: endedAt,
        status: 'no-answer',
      });
    }
    await doc.save();
    return this.toAdminItem(doc.toObject({ virtuals: true }));
  }

  async listForCustomer(customerId: string): Promise<CustomerCallLogAdminItemDto[]> {
    const or: Array<Record<string, unknown>> = [
      { customerExternalRef: customerId },
    ];
    if (isValidObjectId(customerId)) {
      or.push({ customerId: new Types.ObjectId(customerId) });
    }
    const docs = await this.customerCallLogModel
      .find({ $or: or })
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()
      .exec();
    return docs.map((d) => this.toAdminItem(d));
  }

  async listAdmin(query: ListCallLogsAdminQueryDto): Promise<{
    items: CustomerCallLogAdminItemDto[];
    total: number;
  }> {
    const createdAtRange: { $gte?: Date; $lte?: Date } = {};
    if (query.callFrom !== undefined) {
      createdAtRange.$gte = new Date(query.callFrom);
    }
    if (query.callTo !== undefined) {
      createdAtRange.$lte = new Date(query.callTo);
    }
    const filter: Record<string, unknown> =
      Object.keys(createdAtRange).length > 0 ? { createdAt: createdAtRange } : {};
    if (query.channel === 'meet') {
      filter.provider = GOOGLE_MEET_PROVIDER;
    } else if (query.channel === 'voip') {
      filter.provider = { $ne: GOOGLE_MEET_PROVIDER };
    }
    const docs = await this.customerCallLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(ADMIN_LIST_FETCH_CAP)
      .lean()
      .exec();
    const mapped = docs.map((d) => this.toAdminItem(d));
    const outcomeFilter = query.outcome ?? 'all';
    const filtered =
      outcomeFilter === 'all'
        ? mapped
        : mapped.filter((row) =>
            callOutcomeMatchesFilter(row.resolvedOutcome, outcomeFilter),
          );
    const total = filtered.length;
    const skip = query.skip ?? 0;
    const limit = query.limit ?? 50;
    const items = filtered.slice(skip, skip + limit);
    return { items, total };
  }

  private pushUniqueEvent(
    doc: CustomerCallLogDocument,
    event: {
      eventType: string;
      timestamp: Date;
      status?: string;
      durationSeconds?: number;
    },
  ): void {
    const events = doc.events ?? [];
    const idx = events.findIndex((e) => e.eventType === event.eventType);
    if (idx >= 0) {
      events[idx] = { ...events[idx], ...event };
    } else {
      events.push(event);
    }
    doc.events = events;
  }

  private toAdminItem(doc: {
    _id: Types.ObjectId;
    callSid: string;
    provider: string;
    from?: string;
    to?: string;
    direction?: string;
    utterances?: CustomerCallUtterance[];
    durationSeconds?: number;
    recordingUrl?: string;
    transcript?: string;
    text?: string;
    status?: string;
    customerId?: Types.ObjectId;
    customerExternalRef?: string;
    agentExternalRef?: string;
    events?: CustomerCallLog['events'];
    metadata?: Record<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
  }): CustomerCallLogAdminItemDto {
    const events = (doc.events ?? []).map((e) => ({
      eventType: e.eventType,
      timestamp: new Date(e.timestamp).toISOString(),
      status: e.status,
      durationSeconds: e.durationSeconds,
      recordingUrl: e.recordingUrl,
      transcript: e.transcript,
      metadata: e.metadata,
    }));
    const derived = deriveResolvedCallOutcome(doc.events, doc.status);
    const isMeet = doc.provider === GOOGLE_MEET_PROVIDER;
    const eventList = doc.events ?? [];
    const onlyScheduled =
      isMeet &&
      eventList.length > 0 &&
      eventList.every(
        (e) =>
          e.eventType === 'scheduled' || e.eventType === 'transcription-updated',
      );
    const resolvedOutcome =
      onlyScheduled || (isMeet && derived.outcome === 'unknown')
        ? 'in_progress'
        : derived.outcome;
    const customerId =
      doc.customerId !== undefined ? String(doc.customerId) : undefined;
    const createdAt =
      (doc as { createdAt?: Date }).createdAt !== undefined
        ? new Date((doc as { createdAt: Date }).createdAt).toISOString()
        : new Date(0).toISOString();
    const updatedAt =
      (doc as { updatedAt?: Date }).updatedAt !== undefined
        ? new Date((doc as { updatedAt: Date }).updatedAt).toISOString()
        : createdAt;
    const meetUrlRaw = doc.metadata?.googleMeetUrl;
    const googleMeetUrl =
      typeof meetUrlRaw === 'string' && meetUrlRaw.trim()
        ? meetUrlRaw.trim()
        : undefined;
    return {
      id: String(doc._id),
      callSid: doc.callSid,
      provider: doc.provider,
      channel: isMeet ? 'meet' : 'voip',
      googleMeetUrl,
      from: doc.from,
      to: doc.to,
      utterances: doc.utterances,
      direction: doc.direction,
      durationSeconds: doc.durationSeconds,
      recordingUrl: doc.recordingUrl,
      transcript: doc.transcript,
      text: doc.text,
      status: doc.status,
      customerId,
      customerExternalRef: doc.customerExternalRef,
      agentExternalRef: doc.agentExternalRef,
      resolvedOutcome,
      preCompleteEventType: derived.preCompleteEventType,
      completedAt: derived.completedAtIso,
      createdAt,
      updatedAt,
      events,
    };
  }

  async saveVoiceCallTranscription(
    payload: SaveCallTranscriptionDto,
  ): Promise<IngestResult> {
    await this.ensureCallExists(payload.callSid);
    await this.updateCallHeaderTranscription(
      payload.callSid,
      payload.transcript,
      payload.text,
      payload.utterances,
      payload.recordingUrl,
    );
    this.customerCallAuditService.scheduleAnalyzeAfterTranscription(payload.callSid);
    return {
      accepted: true,
      callSid: payload.callSid,
      eventType: 'transcription-updated',
    };
  }

  private async createOrUpdateCallHeader(
    payload: IngestVoiceCallEventDto,
  ): Promise<void> {
    await this.customerCallLogModel
      .updateOne(
        { callSid: payload.callSid },
        {
          $setOnInsert: {
            callSid: payload.callSid,
            events: [],
          },
          $set: {
            provider: payload.provider,
            from: payload.from,
            to: payload.to,
            status: payload.status,
            direction: payload.direction,
            durationSeconds: payload.durationSeconds,
            recordingUrl: payload.recordingUrl,
            transcript: payload.transcript,
            customerExternalRef: payload.customerExternalRef,
            agentExternalRef: payload.agentExternalRef,
            metadata: payload.metadata,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  private async ensureCallExists(callSid: string): Promise<void> {
    await this.customerCallLogModel
      .updateOne(
        { callSid },
        {
          $setOnInsert: {
            callSid,
            events: [],
            provider: 'twilio',
          },
        },
        { upsert: true },
      )
      .exec();
  }

  private async appendOrUpdateEvent(payload: IngestVoiceCallEventDto): Promise<void> {
    const eventPayload = {
      eventType: payload.eventType,
      timestamp: new Date(payload.timestamp),
      status: payload.status,
      durationSeconds: payload.durationSeconds,
      recordingUrl: payload.recordingUrl,
      metadata: payload.metadata,
    };
    const existingEventUpdate = await this.customerCallLogModel
      .updateOne(
        {
          callSid: payload.callSid,
          'events.eventType': payload.eventType,
        },
        {
          $set: {
            'events.$': eventPayload,
          },
        },
      )
      .exec();
    if (existingEventUpdate.matchedCount === 0) {
      await this.customerCallLogModel
        .updateOne(
          {
            callSid: payload.callSid,
            'events.eventType': { $ne: payload.eventType },
          },
          {
            $push: {
              events: eventPayload,
            },
          },
          { upsert: true },
        )
        .exec();
    }
  }

  private async updateCallHeaderTranscription(
    callSid: string,
    transcript: string | undefined,
    text: string | undefined,
    utterances: Record<string, unknown>[] | undefined,
    recordingUrl: string | undefined,
  ): Promise<void> {
    await this.customerCallLogModel
      .updateOne(
        { callSid },
        {
          $set: {
            transcript,
            text,
            utterances,
            recordingUrl,
          },
        },
      )
      .exec();
  }
}
