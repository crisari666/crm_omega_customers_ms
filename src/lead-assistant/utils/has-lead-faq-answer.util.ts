import type { LeadFaqProjectAnswer } from '../types/lead-faq-project-answer.type';

type FaqAnswerSource = {
  readonly defaultAnswer?: string;
  readonly projectAnswers?: readonly LeadFaqProjectAnswer[];
};

/** True when the FAQ has a non-blank default answer or at least one non-blank project answer. */
export function hasLeadFaqAnswer(source: FaqAnswerSource): boolean {
  const hasDefaultAnswer = (source.defaultAnswer ?? '').trim().length > 0;
  const hasProjectAnswer = (source.projectAnswers ?? []).some((entry) => entry.answer.trim().length > 0);
  return hasDefaultAnswer || hasProjectAnswer;
}
