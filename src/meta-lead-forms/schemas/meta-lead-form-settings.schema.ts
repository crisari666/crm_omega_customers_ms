import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { DEFAULT_OUTBOUND_DELAY_MINUTES } from '../constants/meta-lead-form.constants';

export type MetaLeadFormSettingsDocument = HydratedDocument<MetaLeadFormSettings>;

@Schema({ timestamps: true, collection: 'meta_lead_form_settings' })
export class MetaLeadFormSettings {
  /** Singleton key — always `default`. */
  @Prop({ type: String, required: true, unique: true, default: 'default' })
  key: string;

  @Prop({ type: Number, required: true, default: DEFAULT_OUTBOUND_DELAY_MINUTES, min: 1 })
  outboundDelayMinutes: number;
}

export const MetaLeadFormSettingsSchema = SchemaFactory.createForClass(MetaLeadFormSettings);
