import type { LeadUnansweredQuestionStatus } from './lead-unanswered-question-status.type';

/** Question the assistant could not answer, as exposed by the admin API. */
export type LeadUnansweredQuestionView = {
  readonly id: string;
  readonly question: string;
  readonly sessionId: string;
  readonly customerId: string;
  readonly projectId?: string;
  readonly projectTitle?: string;
  readonly status: LeadUnansweredQuestionStatus;
  readonly faqId?: string;
  readonly askedAt: string;
};
