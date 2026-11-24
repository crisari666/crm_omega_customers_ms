import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, Types } from 'mongoose';
import { LEAD_UNANSWERED_DEFAULT_LIMIT } from './constants/lead-assistant.constants';
import type { ConvertLeadUnansweredQuestionDto } from './dto/convert-lead-unanswered-question.dto';
import type { ListLeadUnansweredQuestionsQueryDto } from './dto/list-lead-unanswered-questions-query.dto';
import { LeadFaqsService } from './lead-faqs.service';
import {
  LeadUnansweredQuestion,
  LeadUnansweredQuestionDocument,
} from './schemas/lead-unanswered-question.schema';
import type { LeadUnansweredQuestionConvertResult } from './types/lead-unanswered-question-convert-result.type';
import type { LeadUnansweredQuestionCreateInput } from './types/lead-unanswered-question-create-input.type';
import type { LeadUnansweredQuestionView } from './types/lead-unanswered-question-view.type';
import type { LeadUnansweredQuestionsPage } from './types/lead-unanswered-questions-page.type';

type UnansweredRow = LeadUnansweredQuestion & { readonly _id: { toString(): string } };

/**
 * Questions the assistant could not answer: logged by the agent, triaged by admins.
 */
@Injectable()
export class LeadUnansweredQuestionsService {
  constructor(
    @InjectModel(LeadUnansweredQuestion.name)
    private readonly questionModel: Model<LeadUnansweredQuestionDocument>,
    private readonly leadFaqsService: LeadFaqsService,
  ) {}

  /** Logs an unanswered question (used by the agent flow). */
  async executeCreate(input: LeadUnansweredQuestionCreateInput): Promise<LeadUnansweredQuestionView> {
    const created = await this.questionModel.create({
      question: input.question.trim(),
      sessionId: new Types.ObjectId(input.sessionId),
      customerId: new Types.ObjectId(input.customerId),
      status: 'open',
      askedAt: new Date(),
      ...(input.projectId != null ? { projectId: input.projectId } : {}),
      ...(input.projectTitle != null ? { projectTitle: input.projectTitle } : {}),
    });
    return this.mapView(created.toObject() as UnansweredRow);
  }

  async executeList(query: ListLeadUnansweredQuestionsQueryDto): Promise<LeadUnansweredQuestionsPage> {
    const page = query.page ?? 0;
    const limit = query.limit ?? LEAD_UNANSWERED_DEFAULT_LIMIT;
    const filter: QueryFilter<LeadUnansweredQuestionDocument> = { status: query.status ?? 'open' };
    const [rows, total] = await Promise.all([
      this.questionModel.find(filter).sort({ askedAt: -1 }).skip(page * limit).limit(limit).lean().exec(),
      this.questionModel.countDocuments(filter).exec(),
    ]);
    return { items: rows.map((row) => this.mapView(row as UnansweredRow)), total, page, limit };
  }

  async executeDismiss(id: string): Promise<LeadUnansweredQuestionView> {
    const updated = await this.questionModel
      .findByIdAndUpdate(id, { $set: { status: 'dismissed' } }, { new: true })
      .lean()
      .exec();
    if (updated == null) {
      throw new NotFoundException(`Unanswered question ${id} was not found`);
    }
    return this.mapView(updated as UnansweredRow);
  }

  /** Creates a FAQ from the question and marks the question as converted. */
  async executeConvert(
    id: string,
    dto: ConvertLeadUnansweredQuestionDto,
    officeUserId?: string,
  ): Promise<LeadUnansweredQuestionConvertResult> {
    const existing = await this.questionModel.findById(id).lean().exec();
    if (existing == null) {
      throw new NotFoundException(`Unanswered question ${id} was not found`);
    }
    if (existing.status === 'converted') {
      throw new ConflictException('Esta pregunta ya fue convertida en una pregunta frecuente');
    }
    const faq = await this.leadFaqsService.executeCreate(
      { ...dto, question: dto.question ?? existing.question },
      officeUserId,
    );
    const updated = await this.questionModel
      .findByIdAndUpdate(id, { $set: { status: 'converted', faqId: new Types.ObjectId(faq.id) } }, { new: true })
      .lean()
      .exec();
    return { faq, question: this.mapView((updated ?? existing) as UnansweredRow) };
  }

  private mapView(row: UnansweredRow): LeadUnansweredQuestionView {
    return {
      id: String(row._id),
      question: row.question,
      sessionId: String(row.sessionId),
      customerId: String(row.customerId),
      projectId: row.projectId,
      projectTitle: row.projectTitle,
      status: row.status,
      faqId: row.faqId != null ? String(row.faqId) : undefined,
      askedAt: row.askedAt.toISOString(),
    };
  }
}
