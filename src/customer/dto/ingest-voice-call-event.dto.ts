import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const EVENT_TYPES = [
  'created',
  'initiated',
  'ringing',
  'answered',
  'completed',
  'busy',
  'no-answer',
  'failed',
  'canceled',
  'transcription-updated',
] as const;

export class IngestVoiceCallEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @IsIn(['twilio'])
  provider: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  callSid: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(EVENT_TYPES)
  eventType: (typeof EVENT_TYPES)[number];

  @IsISO8601()
  timestamp: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['inbound', 'outbound', 'inbound-dial', 'outbound-dial'])
  direction?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  recordingUrl?: string;

  @ValidateIf((value: IngestVoiceCallEventDto) => value.transcript !== undefined)
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  utterances?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerExternalRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentExternalRef?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
