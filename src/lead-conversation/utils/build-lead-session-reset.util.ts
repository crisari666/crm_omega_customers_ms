import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { OutboundMessagePlan } from '../types/outbound-message-plan.type';

export type LeadSessionResetUpdate = {
  readonly $set: Record<string, unknown>;
  readonly $unset: Record<string, ''>;
};

const CLEARED_FIELDS = [
  'projectId',
  'projectTitle',
  'stepBeforeReminder',
  'reminderSentAt',
  'scheduledAt',
] as const;

/**
 * Update that brings a session back to the start of the flow (the transcript is kept).
 * With a `question` the session waits on it (`ask_project`); otherwise it restarts at `initial` on the next inbound.
 */
export function buildLeadSessionReset(question?: OutboundMessagePlan, now: Date = new Date()): LeadSessionResetUpdate {
  const $unset: Record<string, ''> = Object.fromEntries(CLEARED_FIELDS.map((field) => [field, '']));
  if (!question) $unset.lastQuestionAt = '';
  return {
    $set: {
      step: question ? LeadConversationStep.AskProject : LeadConversationStep.Initial,
      status: 'active',
      answers: {},
      score: 0,
      priority: 1,
      scoreHistory: [],
      isAllProjects: false,
      retryCount: 0,
      pendingOptions: question?.options ?? [],
      lastQuestion: question ? [{ ...question, delayMs: undefined }] : [],
      ...(question ? { lastQuestionAt: now } : {}),
    },
    $unset,
  };
}
