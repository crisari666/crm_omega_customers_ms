import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  WHATSAPP_MARKETING_BATCH_DELAY_MS_MAX,
  WHATSAPP_MARKETING_BATCH_DELAY_MS_MIN,
} from '../constants/whatsapp-marketing-batch-delay.constants';

export type WhatsappMarketingCampaignDocument = HydratedDocument<WhatsappMarketingCampaign>;

export type WhatsappMarketingCampaignStatus =
  | 'draft'
  | 'building'
  | 'sending'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type WhatsappMarketingAudienceMode = 'filter' | 'manual' | 'combined';

export type WhatsappMarketingCampaignType = 'standard' | 'recovery_potential';

@Schema({ _id: false })
export class WhatsappMarketingCampaignStats {
  @Prop({ type: Number, required: true, default: 0 })
  total: number;

  @Prop({ type: Number, required: true, default: 0 })
  pending: number;

  @Prop({ type: Number, required: true, default: 0 })
  sent: number;

  @Prop({ type: Number, required: true, default: 0 })
  delivered: number;

  @Prop({ type: Number, required: true, default: 0 })
  read: number;

  @Prop({ type: Number, required: true, default: 0 })
  failed: number;

  @Prop({ type: Number, required: true, default: 0 })
  cancelled: number;
}

export const WhatsappMarketingCampaignStatsSchema =
  SchemaFactory.createForClass(WhatsappMarketingCampaignStats);

@Schema({ timestamps: true, collection: 'whatsapp_marketing_campaigns' })
export class WhatsappMarketingCampaign {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, trim: true })
  templateName: string;

  @Prop({ type: String, required: true, default: 'es', trim: true })
  templateLanguage: string;

  @Prop({ type: Object, required: false })
  templateComponents?: Record<string, unknown>[];

  /** Meta uploaded media id for template header (IMAGE or VIDEO). */
  @Prop({ type: String, required: false, trim: true })
  templateHeaderMediaId?: string;

  @Prop({ type: String, enum: ['image', 'video'], required: false, default: 'image' })
  templateHeaderMediaType?: 'image' | 'video';

  @Prop({
    type: String,
    enum: ['filter', 'manual', 'combined'],
    required: true,
    default: 'filter',
  })
  audienceMode: WhatsappMarketingAudienceMode;

  @Prop({ type: Object, required: false })
  audienceFilter?: Record<string, unknown>;

  @Prop({ type: [String], required: true, default: [] })
  manualCustomerIds: string[];

  @Prop({
    type: String,
    enum: ['standard', 'recovery_potential'],
    required: true,
    default: 'standard',
  })
  campaignType: WhatsappMarketingCampaignType;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'CustomerStep' }], default: [] })
  preserveAssigneeCustomerStepIds: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'CustomerStep', required: false })
  replyAdvanceToCustomerStepId?: Types.ObjectId;

  @Prop({ type: Number, required: true, default: 5, min: 1, max: 50 })
  batchSize: number;

  @Prop({
    type: Number,
    required: true,
    default: WHATSAPP_MARKETING_BATCH_DELAY_MS_MIN,
    min: WHATSAPP_MARKETING_BATCH_DELAY_MS_MIN,
    max: WHATSAPP_MARKETING_BATCH_DELAY_MS_MAX,
  })
  batchDelayMs: number;

  /** When the next batch may be sent (cron respects this; null = due immediately). */
  @Prop({ type: Date, required: false, default: null })
  nextBatchAt?: Date | null;

  @Prop({
    type: String,
    enum: ['draft', 'building', 'sending', 'completed', 'cancelled', 'failed'],
    required: true,
    default: 'draft',
    index: true,
  })
  status: WhatsappMarketingCampaignStatus;

  @Prop({ type: WhatsappMarketingCampaignStatsSchema, required: true })
  stats: WhatsappMarketingCampaignStats;

  @Prop({ type: String, required: true, index: true })
  createdBy: string;

  @Prop({ type: String, required: true })
  updatedBy: string;
}

export const WhatsappMarketingCampaignSchema =
  SchemaFactory.createForClass(WhatsappMarketingCampaign);
