import { LeadConversationStep } from '../../types/lead-conversation-step.enum';
import type { LeadProfile } from '../../types/lead-profile.type';

const SLOT_CHOICE_STEPS: readonly LeadConversationStep[] = [
  LeadConversationStep.AskSchedule,
  LeadConversationStep.AskCallSlot,
];

/** Motivations that count as a real buyer (not curiosity). */
const BUYER_MOTIVATIONS: ReadonlySet<NonNullable<LeadProfile['motivation']>> = new Set([
  'build',
  'invest',
  'leisure',
]);

export type LeadAgentCanOfferCallInput = {
  readonly projectId?: string;
  readonly motivation?: LeadProfile['motivation'];
  readonly step: LeadConversationStep;
  /** Customer explicitly asked for an advisor call (`wants_call`) — bypasses motivation gate. */
  readonly explicitlyRequestedCall?: boolean;
};

/**
 * True when the agent may offer call slots: already on a slot-choice step, or
 * the lead has a project and (buyer motivation or an explicit call request).
 * Still requires a project when not already choosing slots.
 */
export function isLeadQualifiedToOfferCall(input: LeadAgentCanOfferCallInput): boolean {
  if (SLOT_CHOICE_STEPS.includes(input.step)) return true;
  if (input.projectId === undefined) return false;
  if (input.explicitlyRequestedCall === true) return true;
  return input.motivation !== undefined && BUYER_MOTIVATIONS.has(input.motivation);
}
