import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LeadConversationMessageDocument = HydratedDocument<LeadConversationMessage>;

export const LEAD_MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const;

export type LeadMessageDirection = (typeof LEAD_MESSAGE_DIRECTIONS)[number];

/** Transcript row of the lead qualification conversation (shown to ventors). */
@Schema({ collection: 'lead_conversation_messages', timestamps: true })
export class LeadConversationMessage {
  @Prop({ type: Types.ObjectId, ref: 'LeadConversationSession', required: true, index: true })
  sessionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  /** Meta message id; unique when present (inbound dedupe + outbound correlation). */
  @Prop({ required: false })
  wamid?: string;

  @Prop({ type: String, enum: LEAD_MESSAGE_DIRECTIONS, required: true })
  direction: LeadMessageDirection;

  @Prop({ required: true })
  kind: string;

  @Prop({ default: '' })
  body: string;

  @Prop({ type: [String], default: [] })
  options: string[];

  @Prop({ required: false })
  interactiveReplyId?: string;

  @Prop({ required: false })
  mediaUrl?: string;

  @Prop({ type: Boolean, default: true })
  delivered: boolean;

  @Prop({ type: Date, required: true })
  timestamp: Date;
}

export const LeadConversationMessageSchema = SchemaFactory.createForClass(LeadConversationMessage);

LeadConversationMessageSchema.index(
  { wamid: 1 },
  { unique: true, partialFilterExpression: { wamid: { $type: 'string' } } },
);
LeadConversationMessageSchema.index({ customerId: 1, timestamp: -1 });
