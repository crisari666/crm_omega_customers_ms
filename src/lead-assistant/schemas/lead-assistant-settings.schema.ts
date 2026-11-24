import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { LeadFlowVersion } from '../../lead-conversation/types/lead-flow-version.type';
import {
  LEAD_ASSISTANT_DEFAULT_GREETING,
  LEAD_ASSISTANT_DEFAULT_NAME,
  LEAD_ASSISTANT_SETTINGS_KEY,
  LEAD_REPLY_DEBOUNCE_DEFAULT_SECONDS,
  LEAD_REPLY_DEBOUNCE_MAX_SECONDS,
  LEAD_REPLY_DEBOUNCE_MIN_SECONDS,
} from '../constants/lead-assistant.constants';
import { LEAD_PRICE_POLICIES, type LeadPricePolicy } from '../types/lead-price-policy.type';
import { LeadTemplateRefEmbedded, LeadTemplateRefEmbeddedSchema } from './lead-template-ref-embedded.schema';

export type LeadAssistantSettingsDocument = HydratedDocument<LeadAssistantSettings>;

/** Singleton (`key: 'default'`) with the identity and behavior of the lead assistant. */
@Schema({ timestamps: true, collection: 'lead_assistant_settings' })
export class LeadAssistantSettings {
  @Prop({ type: String, required: true, unique: true, default: LEAD_ASSISTANT_SETTINGS_KEY })
  key: string;

  @Prop({ type: String, default: LEAD_ASSISTANT_DEFAULT_NAME })
  assistantName: string;

  @Prop({ type: String, default: '' })
  businessName: string;

  @Prop({ type: String, default: LEAD_ASSISTANT_DEFAULT_GREETING })
  greeting: string;

  @Prop({ type: String, enum: LEAD_PRICE_POLICIES, default: 'entry_ticket_first' })
  pricePolicy: LeadPricePolicy;

  @Prop({ type: String, enum: ['v1', 'v2'], default: 'v1' })
  defaultInboundFlow: LeadFlowVersion;

  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({
    type: Number,
    default: LEAD_REPLY_DEBOUNCE_DEFAULT_SECONDS,
    min: LEAD_REPLY_DEBOUNCE_MIN_SECONDS,
    max: LEAD_REPLY_DEBOUNCE_MAX_SECONDS,
  })
  replyDebounceSeconds: number;

  @Prop({ type: LeadTemplateRefEmbeddedSchema, required: false })
  welcomeTemplate?: LeadTemplateRefEmbedded;
}

export const LeadAssistantSettingsSchema = SchemaFactory.createForClass(LeadAssistantSettings);
