import { Injectable } from '@nestjs/common';
import { REPLY_ID } from '../constants/lead-conversation.constants';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { LeadMessageComposerService } from '../lead-message-composer.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadStepHandler } from '../types/lead-step-handler.interface';
import type { StepContext } from '../types/step-context.type';
import type { StepTransition } from '../types/step-transition.type';

/** Answer to the 1-hour reminder: "Sí" → schedule question; "No" → score 1 / priority 1, closed. */
@Injectable()
export class ReminderReplyHandler implements LeadStepHandler {
  readonly steps = [LeadConversationStep.ReminderSent] as const;

  constructor(
    private readonly composer: LeadMessageComposerService,
    private readonly transitions: LeadFlowTransitionsService,
  ) {}

  async handle({ session, selectedOption }: StepContext): Promise<StepTransition> {
    if (selectedOption?.id === REPLY_ID.reminderYes) {
      return this.transitions.buildAskSchedule(session.answers?.formaPago);
    }
    if (selectedOption?.id === REPLY_ID.reminderNo) {
      return {
        nextStep: LeadConversationStep.Closed,
        status: 'disqualified',
        scoreEvent: 'reminder_declined',
        outbound: this.composer.composeReminderDeclined(session.firstName),
        expectsReply: false,
      };
    }
    return this.transitions.buildRetry(session);
  }
}
