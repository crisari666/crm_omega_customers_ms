export const LEAD_UNANSWERED_QUESTION_STATUSES = ['open', 'converted', 'dismissed'] as const;

export type LeadUnansweredQuestionStatus = (typeof LEAD_UNANSWERED_QUESTION_STATUSES)[number];
