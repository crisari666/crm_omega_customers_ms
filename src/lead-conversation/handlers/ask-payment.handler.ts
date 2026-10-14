import { Injectable } from '@nestjs/common';
import { PAYMENT_BY_REPLY_ID } from '../constants/answer-mappings.constants';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadStepHandler } from '../types/lead-step-handler.interface';
import type { StepContext } from '../types/step-context.type';
import type { StepTransition } from '../types/step-transition.type';

/** Customer picks financed / cash (`forma_pago`, +2) → call schedule question. */
@Injectable()
export class AskPaymentHandler implements LeadStepHandler {
  readonly steps = [LeadConversationStep.AskPayment] as const;

  constructor(private readonly transitions: LeadFlowTransitionsService) {}

  async handle({ session, selectedOption }: StepContext): Promise<StepTransition> {
    const paymentMethod = selectedOption ? PAYMENT_BY_REPLY_ID[selectedOption.id] : undefined;
    if (!paymentMethod) {
      return this.transitions.buildRetry(session);
    }
    return {
      ...this.transitions.buildAskSchedule(paymentMethod),
      answersPatch: { formaPago: paymentMethod },
      scoreEvent: 'payment',
    };
  }
}
