import type { LeadConversationAnswers } from '../../types/lead-conversation-answers.type';
import type { LeadConversationStatus } from '../../types/lead-conversation-status.type';
import type { LeadConversationStep } from '../../types/lead-conversation-step.enum';
import type { LeadProfile } from '../../types/lead-profile.type';
import type { OutboundMessagePlan } from '../../types/outbound-message-plan.type';
import type { LeadAgentLlmTurn } from './lead-agent-llm-turn.type';

/** Per-turn decisions already taken (plans, step, status) before the score and the patch are computed. */
export type LeadAgentTurnDraft = {
  readonly outbound: readonly OutboundMessagePlan[];
  readonly nextStep: LeadConversationStep;
  readonly status?: LeadConversationStatus;
  readonly answersPatch?: Partial<LeadConversationAnswers>;
  readonly profile: LeadProfile;
  readonly signals: readonly string[];
  readonly intents: LeadAgentLlmTurn['intents'];
  readonly action: LeadAgentLlmTurn['action'];
  readonly isOptOut: boolean;
};
