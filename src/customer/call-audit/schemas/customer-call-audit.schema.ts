import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  CALL_AUDIT_STATUS_COMPLETED,
  type CallAuditSource,
  type CallAuditSpeakerRole,
  type CallAuditStatus,
} from '../constants/call-audit.constant';

export type CustomerCallAuditDocument = HydratedDocument<CustomerCallAudit>;

@Schema({ _id: false })
export class CallAuditIndicatorEmbedded {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  passed: boolean;

  @Prop({ required: false })
  rationale?: string;

  @Prop({ required: false })
  evidence?: string;
}

@Schema({ _id: false })
export class CallAuditSpeakerTurnEmbedded {
  @Prop({ required: true, enum: ['agent', 'customer'] })
  role: CallAuditSpeakerRole;

  @Prop({ required: true })
  text: string;
}

@Schema({ collection: 'customer_call_audits', timestamps: true })
export class CustomerCallAudit {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  callLogId: Types.ObjectId;

  @Prop({ required: true, index: true })
  callSid: string;

  @Prop({ required: true, index: true })
  agentExternalRef: string;

  @Prop({ required: true, enum: ['human', 'ai'] })
  source: CallAuditSource;

  @Prop({ required: true })
  configVersion: string;

  @Prop({ type: [CallAuditIndicatorEmbedded], required: true, default: [] })
  indicators: CallAuditIndicatorEmbedded[];

  @Prop({ required: true })
  interestScore: number;

  @Prop({ required: false })
  interestScoreRationale?: string;

  @Prop({ type: [CallAuditSpeakerTurnEmbedded], required: false, default: undefined })
  speakerTurns?: CallAuditSpeakerTurnEmbedded[];

  @Prop({ required: false, index: true })
  auditorUserId?: string;

  @Prop({ required: false })
  reviewerNotes?: string;

  @Prop({
    required: true,
    enum: ['pending', 'completed', 'failed'],
    default: CALL_AUDIT_STATUS_COMPLETED,
  })
  status: CallAuditStatus;

  @Prop({ required: false })
  llmModel?: string;

  @Prop({ required: false })
  llmError?: string;

  @Prop({ required: false })
  analyzedAt?: Date;
}

export const CustomerCallAuditSchema =
  SchemaFactory.createForClass(CustomerCallAudit);

CustomerCallAuditSchema.index(
  { callLogId: 1, source: 1 },
  { unique: true, name: 'callLogId_source_unique' },
);

CustomerCallAuditSchema.index(
  { agentExternalRef: 1, source: 1, createdAt: -1 },
  { name: 'agent_source_created' },
);
