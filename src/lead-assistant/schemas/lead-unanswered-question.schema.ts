import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  LEAD_UNANSWERED_QUESTION_STATUSES,
  type LeadUnansweredQuestionStatus,
} from '../types/lead-unanswered-question-status.type';

export type LeadUnansweredQuestionDocument = HydratedDocument<LeadUnansweredQuestion>;

/** Customer question the assistant could not answer; admins convert it into a FAQ or dismiss it. */
@Schema({ timestamps: true, collection: 'lead_unanswered_questions' })
export class LeadUnansweredQuestion {
  @Prop({ type: String, required: true })
  question: string;

  @Prop({ type: Types.ObjectId, ref: 'LeadConversationSession', required: true })
  sessionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true })
  customerId: Types.ObjectId;

  @Prop({ type: String, required: false })
  projectId?: string;

  @Prop({ type: String, required: false })
  projectTitle?: string;

  @Prop({ type: String, enum: LEAD_UNANSWERED_QUESTION_STATUSES, default: 'open' })
  status: LeadUnansweredQuestionStatus;

  @Prop({ type: Types.ObjectId, ref: 'LeadFaq', required: false })
  faqId?: Types.ObjectId;

  @Prop({ type: Date, required: true, default: () => new Date() })
  askedAt: Date;
}

export const LeadUnansweredQuestionSchema = SchemaFactory.createForClass(LeadUnansweredQuestion);
LeadUnansweredQuestionSchema.index({ status: 1, askedAt: -1 });
