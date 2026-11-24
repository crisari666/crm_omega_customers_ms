import type { LeadConversationAnswers } from '../../types/lead-conversation-answers.type';
import type { LeadConversationStatus } from '../../types/lead-conversation-status.type';
import type { LeadConversationStep } from '../../types/lead-conversation-step.enum';
import type { LeadProfile } from '../../types/lead-profile.type';
import type { LeadAgentHistoryMessage } from './lead-agent-history-message.type';

/** In-memory conversation state of the admin simulator (round-tripped by the client). */
export type SimulatedLeadState = {
  readonly firstName: string;
  readonly step: LeadConversationStep;
  readonly status: LeadConversationStatus;
  readonly projectId?: string;
  readonly projectTitle?: string;
  readonly leadProfile: LeadProfile;
  readonly scoreSignals: readonly string[];
  readonly transcript: readonly LeadAgentHistoryMessage[];
  /** Answers collected so far (payment, lot range, call period); optional so a fresh state needs none. */
  readonly answers?: LeadConversationAnswers;
};
