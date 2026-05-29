import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WhatsappMarketingRecipientDocument =
  HydratedDocument<WhatsappMarketingCampaignRecipient>;

export type WhatsappMarketingRecipientStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'cancelled'
  | 'replied';

export type WhatsappMarketingStatusSource = 'api' | 'webhook';

export type WhatsappMarketingReplyType = 'button' | 'text';

export type WhatsappMarketingReplyOutcome =
  | 'preserved_assignee'
  | 'assigned_ventor'
  | 'reassigned_ventor'
  | 'step_advanced'
  | 'reply_logged'
  | 'ignored_wrong_step';

@Schema({ _id: false })
export class WhatsappMarketingStatusHistoryEntry {
  @Prop({ type: String, required: true })
  status: string;

  @Prop({ type: Date, required: true })
  at: Date;

  @Prop({ type: String, enum: ['api', 'webhook'], required: true })
  source: WhatsappMarketingStatusSource;

  @Prop({ type: String, required: false })
  detail?: string;
}

export const WhatsappMarketingStatusHistoryEntrySchema = SchemaFactory.createForClass(
  WhatsappMarketingStatusHistoryEntry,
);

@Schema({ timestamps: true, collection: 'whatsapp_marketing_campaign_recipients' })
export class WhatsappMarketingCampaignRecipient {
  @Prop({ type: Types.ObjectId, ref: 'WhatsappMarketingCampaign', required: true, index: true })
  campaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  phone: string;

  @Prop({ type: String, required: true, default: '' })
  customerName: string;

  @Prop({ type: Types.ObjectId, ref: 'CustomerStep', required: false })
  customerStepIdAtSend?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CustomerStep', required: false })
  customerStepIdAtReply?: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled', 'replied'],
    required: true,
    default: 'pending',
    index: true,
  })
  status: WhatsappMarketingRecipientStatus;

  @Prop({ type: String, required: false, index: true, sparse: true })
  whatsappMessageId?: string;

  @Prop({ type: Number, required: true, default: 0 })
  attemptCount: number;

  @Prop({ type: Date, required: false })
  lastStatusAt?: Date;

  @Prop({ type: String, enum: ['api', 'webhook'], required: false })
  lastStatusSource?: WhatsappMarketingStatusSource;

  @Prop({ type: String, required: false })
  errorCode?: string;

  @Prop({ type: String, required: false })
  errorMessage?: string;

  @Prop({ type: [WhatsappMarketingStatusHistoryEntrySchema], default: [] })
  statusHistory: WhatsappMarketingStatusHistoryEntry[];

  @Prop({ type: Date, required: false })
  repliedAt?: Date;

  @Prop({ type: String, enum: ['button', 'text'], required: false })
  replyType?: WhatsappMarketingReplyType;

  @Prop({ type: String, required: false })
  replyPayload?: string;

  @Prop({ type: Date, required: false })
  replyHandledAt?: Date;

  @Prop({ type: String, required: false })
  replyOutcome?: WhatsappMarketingReplyOutcome;
}

export const WhatsappMarketingCampaignRecipientSchema = SchemaFactory.createForClass(
  WhatsappMarketingCampaignRecipient,
);

WhatsappMarketingCampaignRecipientSchema.index(
  { campaignId: 1, customerId: 1 },
  { unique: true },
);
WhatsappMarketingCampaignRecipientSchema.index({ campaignId: 1, status: 1 });
WhatsappMarketingCampaignRecipientSchema.index(
  { whatsappMessageId: 1 },
  { unique: true, sparse: true },
);
