import { Injectable } from '@nestjs/common';
import { LeadCallSlotService } from '../lead-call-slot.service';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { LeadMessageComposerService } from '../lead-message-composer.service';
import type { LeadCallPeriod } from '../types/lead-call-period.type';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadStepHandler } from '../types/lead-step-handler.interface';
import type { OutboundOption } from '../types/outbound-message-plan.type';
import type { StepContext } from '../types/step-context.type';
import type { StepTransition } from '../types/step-transition.type';
import { findCallPeriod } from '../utils/find-call-period.util';
import { parseCallSlotReplyId } from '../utils/parse-call-slot-reply-id.util';

const ROW_NUMBER_REGEX = /^\s*(\d{1,2})\s*$/;
const DEFAULT_PERIOD: LeadCallPeriod = 'morning';

/**
 * Customer picks a 30-minute slot (`horario_llamada`, +3) → call booked with a free advance-leads user,
 * customer assigned to that user, confirmation with date and time.
 */
@Injectable()
export class AskCallSlotHandler implements LeadStepHandler {
  readonly steps = [LeadConversationStep.AskCallSlot] as const;

  constructor(
    private readonly composer: LeadMessageComposerService,
    private readonly transitions: LeadFlowTransitionsService,
    private readonly callSlots: LeadCallSlotService,
  ) {}

  async handle({ session, message, selectedOption }: StepContext): Promise<StepTransition> {
    const option = selectedOption ?? findOptionByRowNumber(session.pendingOptions ?? [], message.text);
    const slotStart = option ? parseCallSlotReplyId(option.id) : undefined;
    if (!slotStart) {
      return this.transitions.buildRetry(session);
    }
    const result = await this.callSlots.bookSlot({ sessionId: session._id, customerId: session.customerId, slotStart });
    if (!result.booked) {
      return this.transitions.buildAskCallSlot(findCallPeriod(slotStart) ?? DEFAULT_PERIOD, true);
    }
    return {
      nextStep: LeadConversationStep.Scheduled,
      status: 'scheduled',
      answersPatch: { fechaLlamada: result.scheduledAt.toISOString() },
      scoreEvent: 'schedule',
      outbound: this.composer.composeConfirmation(session.firstName, result.scheduledAt),
      expectsReply: false,
      shouldQualify: true,
    };
  }
}

/** "3" → third offered row (customers often answer a list with its position). */
function findOptionByRowNumber(options: readonly OutboundOption[], text: string): OutboundOption | undefined {
  const match = ROW_NUMBER_REGEX.exec(text);
  if (!match) return undefined;
  return options[Number(match[1]) - 1];
}
