import type { LeadUnansweredQuestionView } from './lead-unanswered-question-view.type';

export type LeadUnansweredQuestionsPage = {
  readonly items: readonly LeadUnansweredQuestionView[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
};
