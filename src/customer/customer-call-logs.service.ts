import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IngestVoiceCallEventDto } from './dto/ingest-voice-call-event.dto';
import { SaveCallTranscriptionDto } from './dto/save-call-transcription.dto';
import {
  CustomerCallLog,
  CustomerCallLogDocument,
} from './schemas/customer-call-log.schema';

type IngestResult = {
  accepted: true;
  callSid: string;
  eventType: string;
  customerId?: string;
};

@Injectable()
export class CustomerCallLogsService {
  constructor(
    @InjectModel(CustomerCallLog.name)
    private readonly customerCallLogModel: Model<CustomerCallLogDocument>,
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
