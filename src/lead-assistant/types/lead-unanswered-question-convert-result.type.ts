import type { LeadFaqView } from './lead-faq-view.type';
import type { LeadUnansweredQuestionView } from './lead-unanswered-question-view.type';

/** Result of turning an unanswered question into a FAQ. */
export type LeadUnansweredQuestionConvertResult = {
  readonly faq: LeadFaqView;
  readonly question: LeadUnansweredQuestionView;
};
