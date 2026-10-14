import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import type { LeadConversationAnswers } from '../types/lead-conversation-answers.type';
import { LEAD_CONVERSATION_STATUSES, LeadConversationStatus } from '../types/lead-conversation-status.type';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { OutboundMessagePlan, OutboundOption } from '../types/outbound-message-plan.type';

export type LeadConversationSessionDocument = HydratedDocument<LeadConversationSession>;

/**
 * One AI lead qualification conversation per WhatsApp user and business line.
 * `version` is used as an optimistic lock so concurrent webhooks cannot double-advance a step.
 */
@Schema({ collection: 'lead_conversation_sessions', timestamps: true })
export class LeadConversationSession {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true })
  waId: string;

  @Prop({ required: true })
  phoneNumberId: string;

  @Prop({ default: '' })
  profileName: string;

  @Prop({ default: '' })
  firstName: string;

  @Prop({ type: String, enum: Object.values(LeadConversationStep), default: LeadConversationStep.Initial })
  step: LeadConversationStep;

  @Prop({ type: String, enum: Object.values(LeadConversationStep), required: false })
  stepBeforeReminder?: LeadConversationStep;

  @Prop({ type: String, enum: LEAD_CONVERSATION_STATUSES, default: 'active', index: true })
  status: LeadConversationStatus;

  @Prop({ required: false })
  projectId?: string;

  @Prop({ required: false })
  projectTitle?: string;

  @Prop({ type: Boolean, default: false })
  isAllProjects: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  answers: LeadConversationAnswers;

  @Prop({ type: Number, default: 0 })
  score: number;

  @Prop({ type: Number, default: 1 })
  priority: number;

  @Prop({
    type: [{ step: String, points: Number, at: Date }],
    default: [],
    _id: false,
  })
  scoreHistory: { step: string; points: number; at: Date }[];

  /** Options offered by the last question; used to resolve reply ids and free-text answers. */
  @Prop({ type: [{ id: String, title: String }], default: [], _id: false })
  pendingOptions: OutboundOption[];

  /** Last question sent, re-sent when the answer cannot be understood. */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  lastQuestion: OutboundMessagePlan[];

  @Prop({ type: Number, default: 0 })
  retryCount: number;

  @Prop({ type: Date, required: false })
  lastInboundAt?: Date;

  @Prop({ type: Date, required: false })
  lastQuestionAt?: Date;

  @Prop({ type: Date, required: false })
  reminderSentAt?: Date;

  @Prop({ required: false })
  assignedVentorId?: string;

  @Prop({ type: Date, required: false })
  scheduledAt?: Date;

  @Prop({ type: Number, default: 0 })
  version: number;
}

export const LeadConversationSessionSchema = SchemaFactory.createForClass(LeadConversationSession);

LeadConversationSessionSchema.index({ waId: 1, phoneNumberId: 1 }, { unique: true });
