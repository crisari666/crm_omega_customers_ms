import type {
  ConsumerDeserializer,
  IncomingEvent,
  IncomingRequest,
} from '@nestjs/microservices';

type VoiceCrmMessageType = 'call.created' | 'call.event' | 'call.transcription';

type VoiceCrmEnvelope = {
  messageType: VoiceCrmMessageType;
  schemaVersion: number;
  occurredAt: string;
  payload: unknown;
};

const ROUTING_BY_MESSAGE_TYPE: Record<VoiceCrmMessageType, string> = {
  'call.created': 'voice.call.created',
  'call.event': 'voice.call.event',
  'call.transcription': 'voice.call.transcription',
};

/**
 * Maps quantum-voice-server JSON envelopes to Nest microservice packets ({@link IncomingEvent}).
 */
export class VoiceCrmInboundDeserializer implements ConsumerDeserializer {
  deserialize(
    value: unknown,
    _options?: Record<string, unknown>,
  ): IncomingEvent | IncomingRequest {
    if (this.isNestPacket(value)) {
      return value;
    }
    if (!this.isVoiceCrmEnvelope(value)) {
      throw new Error('Voice CRM message is not a valid Nest packet or voice envelope');
    }
    if (value.schemaVersion !== 1) {
      throw new Error('Unsupported schemaVersion for voice CRM envelope');
    }
    const pattern: string = ROUTING_BY_MESSAGE_TYPE[value.messageType];
    return {
      pattern,
      data: value.payload,
    };
  }

  private isNestPacket(value: unknown): value is IncomingEvent | IncomingRequest {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return 'pattern' in record && 'data' in record;
  }

  private isVoiceCrmEnvelope(value: unknown): value is VoiceCrmEnvelope {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const record = value as Record<string, unknown>;
    const messageType = record.messageType;
    if (
      messageType !== 'call.created' &&
      messageType !== 'call.event' &&
      messageType !== 'call.transcription'
    ) {
      return false;
    }
    return typeof record.schemaVersion === 'number' && 'payload' in record;
  }
}
