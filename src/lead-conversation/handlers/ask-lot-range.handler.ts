import { Injectable } from '@nestjs/common';
import { REPLY_ID } from '../constants/lead-conversation.constants';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { LeadMessageComposerService } from '../lead-message-composer.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadStepHandler } from '../types/lead-step-handler.interface';
import type { StepContext } from '../types/step-context.type';
import type { StepTransition } from '../types/step-transition.type';

/** Customer picks a lot size (`rango_lote`, +1) → payment method question. */
@Injectable()
export class AskLotRangeHandler implements LeadStepHandler {
  readonly steps = [LeadConversationStep.AskLotRange] as const;

  constructor(
    private readonly composer: LeadMessageComposerService,
    private readonly transitions: LeadFlowTransitionsService,
  ) {}

  async handle({ session, selectedOption }: StepContext): Promise<StepTransition> {
    if (!selectedOption?.id.startsWith(REPLY_ID.lotPrefix)) {
      return this.transitions.buildRetry(session);
    }
    return {
      nextStep: LeadConversationStep.AskPayment,
      answersPatch: { rangoLote: selectedOption.title },
      scoreEvent: 'lot_range',
      outbound: this.composer.composeAskPayment(session.firstName),
      expectsReply: true,
    };
  }
}
