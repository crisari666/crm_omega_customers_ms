import type { LeadFaqCategory } from './lead-faq-category.type';

/** FAQ with its answer already resolved for a project; handed to the agent. */
export type LeadResolvedFaq = {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly category: LeadFaqCategory;
  readonly alternativePhrasings: readonly string[];
};
