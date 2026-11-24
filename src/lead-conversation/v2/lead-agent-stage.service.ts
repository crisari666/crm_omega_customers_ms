import { Injectable } from '@nestjs/common';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadProfile, LeadProfileStage } from '../types/lead-profile.type';
import { LEAD_AGENT_DISCOVERY_MAX_TURNS, LEAD_AGENT_VALUE_MAX_TURNS } from './constants/lead-agent.constants';
import type { LeadAgentStageInput } from './types/lead-agent-stage-input.type';
import type { LeadAgentStageResult } from './types/lead-agent-stage-result.type';

const SLOT_CHOICE_STEPS: readonly LeadConversationStep[] = [
  LeadConversationStep.AskSchedule,
  LeadConversationStep.AskCallSlot,
];

/**
 * Pure stage machine of the V2 conversation (opening → discovery → value → bridge → booking → booked).
 * Code decides stage changes; the LLM only writes the words.
 * Stays in opening until a project is defined.
 */
@Injectable()
export class LeadAgentStageService {
  /** Returns the profile with the stage reached after this assistant turn and the turns spent in it. */
  applyStage(input: LeadAgentStageInput): LeadProfile {
    const { stage, stageTurns } = this.resolveStage(input);
    return { ...input.profile, stage, stageTurns };
  }

  /** Stage after the turn; `stageTurns` grows while staying in a stage and resets to 0 on a change. */
  resolveStage(input: LeadAgentStageInput): LeadAgentStageResult {
    const current: LeadProfileStage = input.profile.stage ?? 'opening';
    const turns = input.profile.stageTurns ?? 0;
    const next = this.resolveNextStage(current, turns, input);
    return { stage: next, stageTurns: next === current ? turns + 1 : 0 };
  }

  private resolveNextStage(current: LeadProfileStage, turns: number, input: LeadAgentStageInput): LeadProfileStage {
    if (input.status === 'scheduled' || input.nextStep === LeadConversationStep.Scheduled) return 'booked';
    if (current === 'booked') return current;
    if (!input.hasProject) return 'opening';
    if (input.canOfferCall && this.isBookingRequested(input)) return 'booking';
    return this.advanceStage(current, turns, input);
  }

  private isBookingRequested(input: LeadAgentStageInput): boolean {
    return (
      SLOT_CHOICE_STEPS.includes(input.nextStep) ||
      input.action === 'offer_call_slots' ||
      input.intents.includes('wants_call')
    );
  }

  private advanceStage(current: LeadProfileStage, turns: number, input: LeadAgentStageInput): LeadProfileStage {
    const turnsSpent = turns + 1;
    if (current === 'opening') return 'discovery';
    if (current === 'discovery') return this.isDiscoveryComplete(input.profile, turnsSpent) ? 'value' : current;
    if (current === 'value') {
      return turnsSpent >= LEAD_AGENT_VALUE_MAX_TURNS || input.hasNewHighIntent ? 'bridge' : current;
    }
    return current;
  }

  private isDiscoveryComplete(profile: LeadProfile, turnsSpent: number): boolean {
    const isMotivationKnown = profile.motivation !== undefined;
    const hasPaymentOrTimeline = profile.paymentMethod !== undefined || profile.timeline !== undefined;
    return (isMotivationKnown && hasPaymentOrTimeline) || turnsSpent >= LEAD_AGENT_DISCOVERY_MAX_TURNS;
  }
}
