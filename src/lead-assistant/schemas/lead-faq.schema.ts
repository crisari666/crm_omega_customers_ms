import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LEAD_FAQ_CATEGORIES, type LeadFaqCategory } from '../types/lead-faq-category.type';
import {
  LeadFaqProjectAnswerEmbedded,
  LeadFaqProjectAnswerEmbeddedSchema,
} from './lead-faq-project-answer-embedded.schema';

export type LeadFaqDocument = HydratedDocument<LeadFaq>;

/**
 * Frequently asked question the assistant may answer from.
 * Invariant (enforced by the service): `defaultAnswer` or at least one project answer.
 */
@Schema({ timestamps: true, collection: 'lead_faqs' })
export class LeadFaq {
  @Prop({ type: String, required: true })
  question: string;

  @Prop({ type: [String], default: [] })
  alternativePhrasings: string[];

  @Prop({ type: String, enum: LEAD_FAQ_CATEGORIES, required: true })
  category: LeadFaqCategory;

  @Prop({ type: String, required: false })
  defaultAnswer?: string;

  @Prop({ type: [LeadFaqProjectAnswerEmbeddedSchema], default: [] })
  projectAnswers: LeadFaqProjectAnswerEmbedded[];

  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({ type: Number, default: 0 })
  timesUsed: number;

  @Prop({ type: Date, required: false })
  lastUsedAt?: Date;

  @Prop({ type: String, required: false })
  createdByOfficeUserId?: string;
}

export const LeadFaqSchema = SchemaFactory.createForClass(LeadFaq);
LeadFaqSchema.index({ enabled: 1, category: 1 });
