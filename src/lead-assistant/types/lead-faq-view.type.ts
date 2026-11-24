import type { LeadFaqCategory } from './lead-faq-category.type';
import type { LeadFaqProjectAnswer } from './lead-faq-project-answer.type';

/** FAQ as exposed by the admin API. */
export type LeadFaqView = {
  readonly id: string;
  readonly question: string;
  readonly alternativePhrasings: readonly string[];
  readonly category: LeadFaqCategory;
  readonly defaultAnswer?: string;
  readonly projectAnswers: readonly LeadFaqProjectAnswer[];
  readonly enabled: boolean;
  readonly timesUsed: number;
  readonly lastUsedAt?: string;
  readonly createdByOfficeUserId?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
};
