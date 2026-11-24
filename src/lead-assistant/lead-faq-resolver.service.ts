import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LEAD_FAQ_RESOLVE_CAP } from './constants/lead-assistant.constants';
import { LeadFaq, LeadFaqDocument } from './schemas/lead-faq.schema';
import type { LeadFaqResolveInput } from './types/lead-faq-resolve-input.type';
import type { LeadResolvedFaq } from './types/lead-resolved-faq.type';
import { scoreLeadFaqMatch } from './utils/score-lead-faq-match.util';

type FaqRow = LeadFaq & { readonly _id: { toString(): string } };

type RankedFaq = {
  readonly resolved: LeadResolvedFaq;
  readonly matchScore: number;
  readonly timesUsed: number;
};

/**
 * Resolves enabled FAQs into question/answer pairs for the agent prompt.
 */
@Injectable()
export class LeadFaqResolverService {
  constructor(@InjectModel(LeadFaq.name) private readonly faqModel: Model<LeadFaqDocument>) {}

  /**
   * Project answer wins over the default answer; FAQs with neither are skipped.
   * When `customerText` is set, phrasing overlap ranks above usage; then most used first.
   * Capped at 60.
   */
  async executeResolve(input: LeadFaqResolveInput = {}): Promise<LeadResolvedFaq[]> {
    const rows = (await this.faqModel.find({ enabled: true }).lean().exec()) as FaqRow[];
    const customerText = input.customerText?.trim() ?? '';
    const ranked: RankedFaq[] = [];
    for (const row of rows) {
      const resolved = this.resolveRow(row, input.projectId);
      if (resolved == null) {
        continue;
      }
      ranked.push({
        resolved,
        matchScore: customerText.length > 0 ? scoreLeadFaqMatch(customerText, row) : 0,
        timesUsed: row.timesUsed ?? 0,
      });
    }
    return ranked
      .sort((first, second) => {
        if (second.matchScore !== first.matchScore) {
          return second.matchScore - first.matchScore;
        }
        return second.timesUsed - first.timesUsed;
      })
      .slice(0, LEAD_FAQ_RESOLVE_CAP)
      .map((entry) => entry.resolved);
  }

  /** Counts one more use for each FAQ id (ignores invalid ids). */
  async executeMarkUsed(ids: readonly string[]): Promise<void> {
    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return;
    }
    await this.faqModel
      .updateMany({ _id: { $in: validIds } }, { $inc: { timesUsed: 1 }, $set: { lastUsedAt: new Date() } })
      .exec();
  }

  private resolveRow(row: FaqRow, projectId?: string): LeadResolvedFaq | null {
    const projectAnswer =
      projectId != null
        ? (row.projectAnswers ?? []).find((entry) => entry.projectId === projectId && entry.answer.trim().length > 0)
        : undefined;
    const answer = (projectAnswer?.answer ?? row.defaultAnswer ?? '').trim();
    if (answer.length === 0) {
      return null;
    }
    return {
      id: String(row._id),
      question: row.question,
      answer,
      category: row.category,
      alternativePhrasings: row.alternativePhrasings ?? [],
    };
  }
}
