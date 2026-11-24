import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  LEAD_RECOVERY_MAX_OFFSET_HOURS,
  LEAD_RECOVERY_MIN_OFFSET_HOURS,
} from '../constants/lead-assistant.constants';
import { LeadTemplateRefEmbedded, LeadTemplateRefEmbeddedSchema } from './lead-template-ref-embedded.schema';

/** Embedded shape of `LeadRecoveryStep`. */
@Schema({ _id: false })
export class LeadRecoveryStepEmbedded {
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, required: true })
  label: string;

  @Prop({
    type: Number,
    required: true,
    min: LEAD_RECOVERY_MIN_OFFSET_HOURS,
    max: LEAD_RECOVERY_MAX_OFFSET_HOURS,
  })
  offsetHours: number;

  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({ type: LeadTemplateRefEmbeddedSchema, required: true })
  template: LeadTemplateRefEmbedded;

  @Prop({ type: Number, default: 0 })
  sentCount: number;

  @Prop({ type: Number, default: 0 })
  repliedCount: number;
}

export const LeadRecoveryStepEmbeddedSchema = SchemaFactory.createForClass(LeadRecoveryStepEmbedded);
