import type { LeadConversationStatus } from '../../types/lead-conversation-status.type';
import type { LeadConversationStep } from '../../types/lead-conversation-step.enum';
import type { LeadProfile } from '../../types/lead-profile.type';
import type { LeadAgentAction } from './lead-agent-action.type';
import type { LeadAgentIntent } from './lead-agent-intent.type';

/** Facts needed to decide the conversation stage after an assistant turn. */
export type LeadAgentStageInput = {
  /** Lead profile after merging this turn (carries the previous `stage` / `stageTurns`). */
  readonly profile: LeadProfile;
  /** Step the session will be on after this turn. */
  readonly nextStep: LeadConversationStep;
  readonly status: LeadConversationStatus;
  readonly intents: readonly LeadAgentIntent[];
  readonly action: LeadAgentAction;
  /** True when `high_intent_question` was earned in this very turn. */
  readonly hasNewHighIntent: boolean;
  /** True when the session (or this turn) has a resolved `projectId`. */
  readonly hasProject: boolean;
  /** True when the lead may jump to booking / call slots (project + buyer motivation, or already on slot steps). */
  readonly canOfferCall: boolean;
};
