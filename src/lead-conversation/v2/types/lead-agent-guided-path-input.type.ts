import type { LeadPricePolicy } from '../../../lead-assistant/types/lead-price-policy.type';
import type { LeadProfile } from '../../types/lead-profile.type';
import type { OutboundMessagePlan } from '../../types/outbound-message-plan.type';
import type { LeadAgentLlmTurn } from './lead-agent-llm-turn.type';
import type { ProjectKnowledge } from './project-knowledge.type';

/** Inputs for deciding financing offer + next-step buttons on one V2 turn. */
export type LeadAgentGuidedPathInput = {
  readonly project?: ProjectKnowledge;
  readonly pricePolicy: LeadPricePolicy;
  readonly profile: LeadProfile;
  readonly previousPaymentMethod?: LeadProfile['paymentMethod'];
  readonly action: LeadAgentLlmTurn['action'];
  readonly intents: readonly LeadAgentLlmTurn['intents'][number][];
  readonly usedFaqIds: readonly string[];
  readonly unansweredQuestion?: string;
  readonly canOfferCall: boolean;
  readonly isOnSlotStep: boolean;
  readonly isBooked: boolean;
  readonly hasConfirmedProject: boolean;
  readonly adoptedCaptureField?: string;
  readonly hasPrecedingText: boolean;
};

/** Outbound plans produced by the guided path for one turn. */
export type LeadAgentGuidedPathOutbound = {
  readonly financing: readonly OutboundMessagePlan[];
  readonly nextStep: readonly OutboundMessagePlan[];
  readonly cashAck: readonly OutboundMessagePlan[];
  readonly sentFinancing: boolean;
};
