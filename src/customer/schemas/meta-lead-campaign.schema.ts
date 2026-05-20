import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MetaLeadCampaignDocument = HydratedDocument<MetaLeadCampaign>;

export enum MetaLeadCampaignStatus {
  Pending = 'pending',
  Processed = 'processed',
  Failed = 'failed',
}

/**
 * Persisted Meta Lead Ads campaign payload from omega_gateway (Ceiba page webhook).
 */
@Schema({ timestamps: true, collection: 'meta_lead_campaigns' })
export class MetaLeadCampaign {
  @Prop({ type: String, required: true, unique: true, index: true })
  leadgenId: string;

  @Prop({ type: String, required: true, default: 'meta_campaign' })
  ingestSource: string;

  @Prop({ type: Object, required: false })
  rawWebhookValue?: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  mappedFields: Record<string, string>;

  @Prop({
    type: [
      {
        name: { type: String, required: true },
        values: { type: [String], default: [] },
      },
    ],
    default: [],
  })
  fieldData: { name: string; values: string[] }[];

  @Prop({ type: String, required: false })
  pageId?: string;

  @Prop({ type: String, required: false })
  formId?: string;

  @Prop({ type: String, required: false })
  graphAdId?: string;

  @Prop({ type: String, required: false })
  graphFormId?: string;

  @Prop({ type: String, required: false })
  graphCreatedTime?: string;

  @Prop({ type: String, required: false, index: true })
  graphPlatform?: string;

  @Prop({ type: String, required: false, index: true })
  graphFormName?: string;

  @Prop({ type: String, required: false })
  graphFormStatus?: string;

  @Prop({ type: String, required: false })
  graphFormLocale?: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: false, index: true })
  customerId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: MetaLeadCampaignStatus,
    default: MetaLeadCampaignStatus.Pending,
    index: true,
  })
  status: MetaLeadCampaignStatus;

  @Prop({ type: String, required: false })
  lastError?: string;

  @Prop({ type: String, required: false })
  gatewayReceivedAt?: string;
}

export const MetaLeadCampaignSchema = SchemaFactory.createForClass(MetaLeadCampaign);

MetaLeadCampaignSchema.index({ createdAt: -1 });
MetaLeadCampaignSchema.index({ status: 1, createdAt: -1 });
