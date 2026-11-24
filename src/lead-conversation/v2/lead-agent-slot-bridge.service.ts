import { Injectable } from '@nestjs/common';
import { LeadConversationStateMachineService } from '../lead-conversation-state-machine.service';
import type { LeadSessionSnapshot } from '../lead-conversation-session.service';
import type { InboundLeadMessage } from '../types/inbound-lead-message.type';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadProfile, LeadProfileStage } from '../types/lead-profile.type';
import type { LeadScoreSignal } from '../types/lead-score-signal.type';
import type { StepTransition } from '../types/step-transition.type';
import { LeadAgentScoringService } from './lead-agent-scoring.service';

/**
 * Lets V2 sessions that wait for a call period / slot choice reuse the V1 slot handlers.
 * The V1 transition is kept, but its V1 `scoreEvent` is replaced by V2 signals and score.
 */
@Injectable()
export class LeadAgentSlotBridgeService {
  constructor(
    private readonly stateMachine: LeadConversationStateMachineService,
    private readonly scoring: LeadAgentScoringService,
  ) {}

  /**
   * Returns the V1 slot transition adapted to V2, or null when the message is not a slot choice
   * (retry or silent) and the agent must answer it instead.
   */
  async executeTryHandle(
    session: LeadSessionSnapshot,
    message: InboundLeadMessage,
    lastTurnMessageId?: string,
  ): Promise<StepTransition | null> {
    const transition = await this.stateMachine.executeTransition(session, message);
    if (transition.isRetry === true || transition.outbound.length === 0) return null;
    const { scoreEvent: _removedScoreEvent, ...v2Transition } = transition;
    const addedSignals = this.resolveAddedSignals(transition);
    const scoreSignals = [...new Set<string>([...(session.scoreSignals ?? []), ...addedSignals])];
    const score = this.scoring.computeScore(scoreSignals);
    const temperature = this.scoring.deriveTemperature(score);
    return {
      ...v2Transition,
      sessionPatch: {
        ...transition.sessionPatch,
        leadProfile: this.resolveProfile(session, transition),
        scoreSignals,
        score,
        priority: this.scoring.derivePriority(temperature),
        temperature,
        ...(lastTurnMessageId !== undefined ? { lastTurnMessageId } : {}),
      },
    };
  }

  private resolveAddedSignals(transition: StepTransition): LeadScoreSignal[] {
    const signals: LeadScoreSignal[] = [];
    if (transition.nextStep === LeadConversationStep.AskCallSlot) signals.push('accepted_call');
    if (transition.status === 'scheduled') signals.push('call_booked');
    return signals;
  }

  private resolveProfile(session: LeadSessionSnapshot, transition: StepTransition): LeadProfile {
    const profile = session.leadProfile ?? {};
    const stage = this.resolveStage(transition);
    if (stage === undefined || stage === profile.stage) return profile;
    return { ...profile, stage, stageTurns: 0 };
  }

  private resolveStage(transition: StepTransition): LeadProfileStage | undefined {
    if (transition.status === 'scheduled') return 'booked';
    return transition.nextStep === LeadConversationStep.AskCallSlot ? 'booking' : undefined;
  }
}
