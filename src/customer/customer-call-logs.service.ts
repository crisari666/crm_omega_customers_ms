import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { IngestVoiceCallEventDto } from './dto/ingest-voice-call-event.dto';
import { ListCallLogsAdminQueryDto } from './dto/list-call-logs-admin.query.dto';
import { SaveCallTranscriptionDto } from './dto/save-call-transcription.dto';
import {
  CustomerCallLog,
  CustomerCallLogDocument,
} from './schemas/customer-call-log.schema';
import {
  callOutcomeMatchesFilter,
  deriveResolvedCallOutcome,
} from './utils/call-log-outcome.util';
import { CustomerEventsService } from './customer-events.service';
import {
  type CustomerCallLogAdminItemDto,
  type IngestResult,
} from './types/customer-call-logs.type';

const ADMIN_LIST_FETCH_CAP = 5000;

@Injectable()
export class CustomerCallLogsService {
  constructor(
    @InjectModel(CustomerCallLog.name)
    private readonly customerCallLogModel: Model<CustomerCallLogDocument>,
    private readonly customerEventsService: CustomerEventsService,
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
    const filter =
      Object.keys(createdAtRange).length > 0 ? { createdAt: createdAtRange } : {};
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

  private toAdminItem(doc: {
    _id: Types.ObjectId;
    callSid: string;
    provider: string;
    from?: string;
    to?: string;
    direction?: string;
    durationSeconds?: number;
    recordingUrl?: string;
    transcript?: string;
    text?: string;
    status?: string;
    customerId?: Types.ObjectId;
    customerExternalRef?: string;
    agentExternalRef?: string;
    events?: CustomerCallLog['events'];
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
    return {
      id: String(doc._id),
      callSid: doc.callSid,
      provider: doc.provider,
      from: doc.from,
      to: doc.to,
      direction: doc.direction,
      durationSeconds: doc.durationSeconds,
      recordingUrl: doc.recordingUrl,
      transcript: doc.transcript,
      text: doc.text,
      status: doc.status,
      customerId,
      customerExternalRef: doc.customerExternalRef,
      agentExternalRef: doc.agentExternalRef,
      resolvedOutcome: derived.outcome,
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
