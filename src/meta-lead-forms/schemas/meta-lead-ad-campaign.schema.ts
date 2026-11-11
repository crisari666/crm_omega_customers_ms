import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MetaLeadAdCampaignDocument = HydratedDocument<MetaLeadAdCampaign>;

/**
 * Admin registry: Meta Campaign id → RAG project for Instant Form / lead-conversation bootstrap.
 */
@Schema({ timestamps: true, collection: 'meta_lead_ad_campaigns' })
export class MetaLeadAdCampaign {
  @Prop({ type: String, required: true, unique: true, index: true })
  campaignId: string;

  @Prop({ type: String, required: true, index: true })
  campaignName: string;

  @Prop({ type: String, required: true, index: true })
  projectId: string;

  @Prop({ type: String, required: false })
  projectTitle?: string;

  @Prop({ type: String, required: false, index: true })
  adId?: string;

  @Prop({ type: String, required: false })
  adName?: string;

  @Prop({ type: Boolean, required: true, default: true, index: true })
  enabled: boolean;

  @Prop({ type: String, required: false, default: '' })
  notes?: string;

  @Prop({ type: String, required: false })
  createdByOfficeUserId?: string;
}

export const MetaLeadAdCampaignSchema =
  SchemaFactory.createForClass(MetaLeadAdCampaign);
