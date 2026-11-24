import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { LeadTemplateBindingSource } from '../../lead-conversation/types/lead-template-binding.type';
import { LEAD_TEMPLATE_BINDING_SOURCES } from '../constants/lead-assistant.constants';

/** Embedded shape of `LeadTemplateBinding`. */
@Schema({ _id: false })
export class LeadTemplateBindingEmbedded {
  @Prop({ type: String, required: true })
  variable: string;

  @Prop({ type: String, enum: ['header', 'body'], required: true })
  component: 'header' | 'body';

  @Prop({ type: String, enum: ['named', 'positional'], required: true })
  format: 'named' | 'positional';

  @Prop({ type: String, enum: LEAD_TEMPLATE_BINDING_SOURCES, required: true })
  source: LeadTemplateBindingSource;

  @Prop({ type: String, required: false })
  staticValue?: string;
}

export const LeadTemplateBindingEmbeddedSchema = SchemaFactory.createForClass(LeadTemplateBindingEmbedded);
