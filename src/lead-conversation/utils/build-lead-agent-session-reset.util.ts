import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadSessionResetUpdate } from './build-lead-session-reset.util';

const UNSET_FIELDS = [
  'projectId',
  'projectTitle',
  'optedOutAt',
  'lastQuestionAt',
  'stepBeforeReminder',
  'reminderSentAt',
  'scheduledAt',
  'temperature',
  'advisorBrief',
] as const;

type LeadAgentSessionResetInput = {
  /** Meta form that originated the conversation; the stored one is kept when omitted. */
  readonly formId?: string;
  /** Last inbound already seen, so the next agent turn only answers newer messages. */
  readonly lastTurnMessageId?: string;
};

/**
 * Update that (re)starts a session as a clean V2 conversation waiting for the customer (transcript kept).
 * Shared by the V1→V2 adoption of a Lead Ads lead and the admin restart of a V2 conversation.
 */
export function buildLeadAgentSessionReset(input: LeadAgentSessionResetInput = {}): LeadSessionResetUpdate {
  return {
    $set: {
      flowVersion: 'v2',
      ...(input.formId ? { formId: input.formId } : {}),
      ...(input.lastTurnMessageId ? { lastTurnMessageId: input.lastTurnMessageId } : {}),
      step: LeadConversationStep.V2Conversation,
      status: 'active',
      answers: {},
      score: 0,
      priority: 1,
      scoreHistory: [],
      scoreSignals: [],
      retryCount: 0,
      pendingOptions: [],
      lastQuestion: [],
      leadProfile: { stage: 'opening', stageTurns: 0 },
      recovery: { sentStepIds: [] },
    },
    $unset: Object.fromEntries(UNSET_FIELDS.map((field) => [field, ''])) as Record<string, ''>,
  };
}
