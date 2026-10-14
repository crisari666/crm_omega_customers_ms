import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LeadConversationSession } from './schemas/lead-conversation-session.schema';
import type { InboundLeadMessage } from './types/inbound-lead-message.type';
import { LeadConversationStep } from './types/lead-conversation-step.enum';
import { LEAD_STEP_HANDLERS, type LeadStepHandler } from './types/lead-step-handler.interface';
import type { OutboundOption } from './types/outbound-message-plan.type';
import type { StepContext } from './types/step-context.type';
import type { StepTransition } from './types/step-transition.type';
import { matchOptionByText } from './utils/match-option-by-text.util';

/**
 * Routes an inbound message to the {@link LeadStepHandler} of the session step (Strategy pattern).
 * Pure decision layer: no persistence, no sending.
 */
@Injectable()
export class LeadConversationStateMachineService {
  private readonly logger = new Logger(LeadConversationStateMachineService.name);
  private readonly handlersByStep: ReadonlyMap<LeadConversationStep, LeadStepHandler>;

  constructor(@Inject(LEAD_STEP_HANDLERS) handlers: readonly LeadStepHandler[]) {
    this.handlersByStep = new Map(handlers.flatMap((handler) => handler.steps.map((step) => [step, handler] as const)));
  }

  async executeTransition(session: StepContext['session'], message: InboundLeadMessage): Promise<StepTransition> {
    const selectedOption = resolveSelectedOption(session.pendingOptions ?? [], message);
    const effectiveStep = this.resolveEffectiveStep(session, message);
    const handler = this.handlersByStep.get(effectiveStep);
    if (!handler) {
      this.logger.warn(`No handler for step ${effectiveStep}; ignoring message ${message.wamid}`);
      return { nextStep: session.step, outbound: [], expectsReply: false };
    }
    return handler.handle({ session: { ...session, step: effectiveStep }, message, selectedOption });
  }

  /** A button tapped from the question before the reminder is answered by that question's handler. */
  private resolveEffectiveStep(session: Readonly<LeadConversationSession>, message: InboundLeadMessage): LeadConversationStep {
    const isStaleReply =
      message.replyId !== undefined && !(session.pendingOptions ?? []).some((option) => option.id === message.replyId);
    if (session.step === LeadConversationStep.ReminderSent && isStaleReply && session.stepBeforeReminder) {
      return session.stepBeforeReminder;
    }
    return session.step;
  }
}

/** Interactive reply id wins; otherwise fuzzy-match the text against the offered options. */
function resolveSelectedOption(
  pendingOptions: readonly OutboundOption[],
  message: InboundLeadMessage,
): OutboundOption | undefined {
  if (message.replyId) {
    return pendingOptions.find((option) => option.id === message.replyId) ?? { id: message.replyId, title: message.text };
  }
  return matchOptionByText(message.text, pendingOptions);
}
