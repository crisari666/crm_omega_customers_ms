import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  LeadTemplateBindingEmbedded,
  LeadTemplateBindingEmbeddedSchema,
} from './lead-template-binding-embedded.schema';

/** Embedded shape of `LeadTemplateRef`. */
@Schema({ _id: false })
export class LeadTemplateRefEmbedded {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  language: string;

  @Prop({ type: String, required: true })
  bodyText: string;

  @Prop({ type: [LeadTemplateBindingEmbeddedSchema], default: [] })
  bindings: LeadTemplateBindingEmbedded[];
}

export const LeadTemplateRefEmbeddedSchema = SchemaFactory.createForClass(LeadTemplateRefEmbedded);
