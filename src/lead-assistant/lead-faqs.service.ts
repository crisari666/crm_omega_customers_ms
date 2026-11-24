import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter } from 'mongoose';
import { escapeRegex } from '../lead-conversation/utils/escape-regex.util';
import type { CreateLeadFaqDto } from './dto/create-lead-faq.dto';
import type { ListLeadFaqsQueryDto } from './dto/list-lead-faqs-query.dto';
import type { UpdateLeadFaqDto } from './dto/update-lead-faq.dto';
import { LeadFaq, LeadFaqDocument } from './schemas/lead-faq.schema';
import type { LeadFaqProjectAnswer } from './types/lead-faq-project-answer.type';
import type { LeadFaqView } from './types/lead-faq-view.type';
import { hasLeadFaqAnswer } from './utils/has-lead-faq-answer.util';

const FAQ_ANSWER_REQUIRED_MESSAGE =
  'La pregunta frecuente necesita una respuesta general o al menos una respuesta por proyecto';

type FaqRow = LeadFaq & {
  readonly _id: { toString(): string };
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
};

const cleanText = (value: string | undefined): string => (value ?? '').trim();

const cleanPhrasings = (values: readonly string[] | undefined): string[] =>
  [...new Set((values ?? []).map(cleanText).filter((value) => value.length > 0))];

const cleanProjectAnswers = (
  values: readonly LeadFaqProjectAnswer[] | undefined,
): LeadFaqProjectAnswer[] =>
  (values ?? [])
    .map((entry) => ({
      projectId: cleanText(entry.projectId),
      projectTitle: cleanText(entry.projectTitle),
      answer: cleanText(entry.answer),
    }))
    .filter((entry) => entry.projectId.length > 0 && entry.answer.length > 0);

/**
 * Admin CRUD of the assistant FAQs. Every FAQ needs a default answer or a project answer.
 */
@Injectable()
export class LeadFaqsService {
  constructor(@InjectModel(LeadFaq.name) private readonly faqModel: Model<LeadFaqDocument>) {}

  async executeList(query: ListLeadFaqsQueryDto): Promise<LeadFaqView[]> {
    const rows = await this.faqModel
      .find(this.buildListFilter(query))
      .sort({ category: 1, createdAt: -1 })
      .lean()
      .exec();
    return rows.map((row) => this.mapView(row as FaqRow));
  }

  async executeCreate(dto: CreateLeadFaqDto, createdByOfficeUserId?: string): Promise<LeadFaqView> {
    const defaultAnswer = cleanText(dto.defaultAnswer);
    const data = {
      question: cleanText(dto.question),
      alternativePhrasings: cleanPhrasings(dto.alternativePhrasings),
      category: dto.category,
      projectAnswers: cleanProjectAnswers(dto.projectAnswers),
      enabled: dto.enabled ?? true,
      ...(defaultAnswer.length > 0 ? { defaultAnswer } : {}),
    };
    this.assertHasAnswer(data);
    const created = await this.faqModel.create({
      ...data,
      ...(createdByOfficeUserId != null && createdByOfficeUserId.length > 0 ? { createdByOfficeUserId } : {}),
    });
    return this.mapView(created.toObject() as FaqRow);
  }

  async executeUpdate(id: string, dto: UpdateLeadFaqDto): Promise<LeadFaqView> {
    const existing = await this.faqModel.findById(id).lean().exec();
    if (existing == null) {
      throw new NotFoundException(`Lead FAQ ${id} was not found`);
    }
    const setFields = this.buildUpdateFields(dto);
    this.assertHasAnswer({
      defaultAnswer: 'defaultAnswer' in setFields ? (setFields.defaultAnswer as string) : existing.defaultAnswer,
      projectAnswers:
        'projectAnswers' in setFields
          ? (setFields.projectAnswers as LeadFaqProjectAnswer[])
          : existing.projectAnswers,
    });
    const updated = await this.faqModel
      .findByIdAndUpdate(id, { $set: setFields }, { new: true })
      .lean()
      .exec();
    if (updated == null) {
      throw new NotFoundException(`Lead FAQ ${id} was not found`);
    }
    return this.mapView(updated as FaqRow);
  }

  async executeDelete(id: string): Promise<{ readonly deleted: true }> {
    const result = await this.faqModel.findByIdAndDelete(id).exec();
    if (result == null) {
      throw new NotFoundException(`Lead FAQ ${id} was not found`);
    }
    return { deleted: true };
  }

  private buildListFilter(query: ListLeadFaqsQueryDto): QueryFilter<LeadFaqDocument> {
    const filter: QueryFilter<LeadFaqDocument> = {};
    if (query.category != null) {
      filter.category = query.category;
    }
    if (query.projectId != null && query.projectId.length > 0) {
      filter['projectAnswers.projectId'] = query.projectId;
    }
    if (query.search != null && query.search.length > 0) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ question: pattern }, { alternativePhrasings: pattern }];
    }
    return filter;
  }

  private buildUpdateFields(dto: UpdateLeadFaqDto): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    if (dto.question != null) {
      fields.question = cleanText(dto.question);
    }
    if (dto.alternativePhrasings != null) {
      fields.alternativePhrasings = cleanPhrasings(dto.alternativePhrasings);
    }
    if (dto.category != null) {
      fields.category = dto.category;
    }
    if (dto.defaultAnswer != null) {
      fields.defaultAnswer = cleanText(dto.defaultAnswer);
    }
    if (dto.projectAnswers != null) {
      fields.projectAnswers = cleanProjectAnswers(dto.projectAnswers);
    }
    if (dto.enabled != null) {
      fields.enabled = dto.enabled;
    }
    return fields;
  }

  private assertHasAnswer(source: {
    readonly defaultAnswer?: string;
    readonly projectAnswers?: readonly LeadFaqProjectAnswer[];
  }): void {
    if (!hasLeadFaqAnswer(source)) {
      throw new BadRequestException(FAQ_ANSWER_REQUIRED_MESSAGE);
    }
  }

  private mapView(row: FaqRow): LeadFaqView {
    const defaultAnswer = cleanText(row.defaultAnswer);
    return {
      id: String(row._id),
      question: row.question,
      alternativePhrasings: row.alternativePhrasings ?? [],
      category: row.category,
      ...(defaultAnswer.length > 0 ? { defaultAnswer } : {}),
      projectAnswers: (row.projectAnswers ?? []).map((entry) => ({
        projectId: entry.projectId,
        projectTitle: entry.projectTitle,
        answer: entry.answer,
      })),
      enabled: row.enabled,
      timesUsed: row.timesUsed ?? 0,
      lastUsedAt: row.lastUsedAt?.toISOString(),
      createdByOfficeUserId: row.createdByOfficeUserId,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  }
}
