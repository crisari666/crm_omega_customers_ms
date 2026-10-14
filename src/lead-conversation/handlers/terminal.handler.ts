import { Injectable } from '@nestjs/common';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadStepHandler } from '../types/lead-step-handler.interface';
import type { StepContext } from '../types/step-context.type';
import type { StepTransition } from '../types/step-transition.type';

/**
 * Scheduled / closed conversations: the bot stays silent (the message is only logged)
 * so the assigned ventor takes over the chat.
 */
@Injectable()
export class TerminalHandler implements LeadStepHandler {
  readonly steps = [LeadConversationStep.Scheduled, LeadConversationStep.Closed] as const;

  constructor(private readonly transitions: LeadFlowTransitionsService) {}

  async handle({ session }: StepContext): Promise<StepTransition> {
    return this.transitions.buildNoop(session);
  }
}
