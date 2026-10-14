import { Injectable } from '@nestjs/common';
import { SLOT_BY_REPLY_ID } from '../constants/answer-mappings.constants';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadStepHandler } from '../types/lead-step-handler.interface';
import type { StepContext } from '../types/step-context.type';
import type { StepTransition } from '../types/step-transition.type';

/** Customer picks a call period (morning 9–12, afternoon 2–5, night 6–9) → list of free 30-minute slots. */
@Injectable()
export class AskScheduleHandler implements LeadStepHandler {
  readonly steps = [LeadConversationStep.AskSchedule] as const;

  constructor(private readonly transitions: LeadFlowTransitionsService) {}

  async handle({ session, selectedOption }: StepContext): Promise<StepTransition> {
    const period = selectedOption ? SLOT_BY_REPLY_ID[selectedOption.id] : undefined;
    if (!period) {
      return this.transitions.buildRetry(session);
    }
    return this.transitions.buildAskCallSlot(period);
  }
}
