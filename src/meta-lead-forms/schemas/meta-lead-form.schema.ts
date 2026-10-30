import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  META_LEAD_FORM_FLOW_STRATEGIES,
  type MetaLeadFormFlowStrategy,
} from '../types/meta-lead-form-flow-strategy.type';

export type MetaLeadFormDocument = HydratedDocument<MetaLeadForm>;

@Schema({ timestamps: true, collection: 'meta_lead_forms' })
export class MetaLeadForm {
  @Prop({ type: String, required: true, unique: true, index: true })
  formId: string;

  @Prop({ type: String, required: true, index: true })
  formName: string;

  @Prop({
    type: String,
    enum: META_LEAD_FORM_FLOW_STRATEGIES,
    required: true,
    index: true,
  })
  flowStrategy: MetaLeadFormFlowStrategy;

  @Prop({ type: Boolean, required: true, default: true, index: true })
  enabled: boolean;

  @Prop({ type: String, required: false, default: '' })
  notes?: string;

  @Prop({ type: String, required: false })
  createdByOfficeUserId?: string;
}

export const MetaLeadFormSchema = SchemaFactory.createForClass(MetaLeadForm);
MetaLeadFormSchema.index(
  { formName: 1 },
  { collation: { locale: 'en', strength: 2 } },
);
