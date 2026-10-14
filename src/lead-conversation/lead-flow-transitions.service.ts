import { Injectable } from '@nestjs/common';
import { MAX_QUESTION_RETRIES } from './constants/lead-conversation.constants';
import { LeadCallSlotService } from './lead-call-slot.service';
import { LeadMessageComposerService } from './lead-message-composer.service';
import { LEAD_CALL_PERIODS, type LeadCallPeriod } from './types/lead-call-period.type';
import type { LeadConversationSession } from './schemas/lead-conversation-session.schema';
import type { LeadPaymentMethod } from './types/lead-conversation-answers.type';
import { LeadConversationStep } from './types/lead-conversation-step.enum';
import type { LeadProject } from './types/lead-project.type';
import type { StepTransition } from './types/step-transition.type';

/** Reusable transitions shared by several step handlers. */
@Injectable()
export class LeadFlowTransitionsService {
  constructor(
    private readonly composer: LeadMessageComposerService,
    private readonly callSlots: LeadCallSlotService,
  ) {}

  async buildAskProject(session: Readonly<LeadConversationSession>): Promise<StepTransition> {
    return {
      nextStep: LeadConversationStep.AskProject,
      outbound: await this.composer.composeAskProject(session.firstName),
      expectsReply: true,
    };
  }

  /** Project intro sequence; skips straight to the payment question when the project has no lot options. */
  buildProjectIntro(session: Readonly<LeadConversationSession>, project: LeadProject): StepTransition {
    const sessionPatch = { projectId: project.id, projectTitle: project.title, isAllProjects: false };
    const outbound = this.composer.composeProjectIntro(session.firstName, project);
    const hasLotQuestion = outbound.some((message) => (message.options ?? []).length > 0);
    if (hasLotQuestion) {
      return { nextStep: LeadConversationStep.AskLotRange, sessionPatch, outbound, expectsReply: true };
    }
    return {
      nextStep: LeadConversationStep.AskPayment,
      sessionPatch,
      outbound: [...outbound, ...this.composer.composeAskPayment(session.firstName)],
      expectsReply: true,
    };
  }

  buildAskSchedule(paymentMethod?: LeadPaymentMethod, isAllProjects?: boolean): StepTransition {
    return {
      nextStep: LeadConversationStep.AskSchedule,
      ...(isAllProjects ? { sessionPatch: { isAllProjects: true } } : {}),
      outbound: this.composer.composeAskSchedule(paymentMethod),
      expectsReply: true,
    };
  }

  /**
   * Free 30-minute slots of the period (list), or the "no slots" notice + period buttons when none is free.
   * `isTaken` prefixes the "that slot was just taken" notice.
   */
  async buildAskCallSlot(period: LeadCallPeriod, isTaken = false): Promise<StepTransition> {
    const slots = await this.callSlots.findFreeSlots(period);
    if (slots.length === 0) {
      return {
        nextStep: LeadConversationStep.AskSchedule,
        answersPatch: { horarioLlamada: period },
        outbound: this.composer.composeNoCallSlots(),
        expectsReply: true,
      };
    }
    return {
      nextStep: LeadConversationStep.AskCallSlot,
      answersPatch: { horarioLlamada: period },
      outbound: this.composer.composeAskCallSlot(period, slots, isTaken),
      expectsReply: true,
    };
  }

  /**
   * Re-asks the last question up to {@link MAX_QUESTION_RETRIES} times, then stays silent.
   * The project list and the call slot list are recomposed because they may have changed since sent.
   */
  async buildRetry(session: Readonly<LeadConversationSession>): Promise<StepTransition> {
    if (session.retryCount >= MAX_QUESTION_RETRIES) {
      return this.buildNoop(session);
    }
    const period = session.answers?.horarioLlamada;
    if (session.step === LeadConversationStep.AskCallSlot && period && LEAD_CALL_PERIODS.includes(period)) {
      const fresh = await this.buildAskCallSlot(period);
      return { ...fresh, outbound: this.composer.composeRetry(fresh.outbound), isRetry: true };
    }
    const lastQuestion =
      session.step === LeadConversationStep.AskProject
        ? await this.composer.composeAskProject(session.firstName)
        : (session.lastQuestion ?? []);
    return {
      nextStep: session.step,
      outbound: this.composer.composeRetry(lastQuestion),
      expectsReply: true,
      isRetry: true,
    };
  }

  buildNoop(session: Readonly<LeadConversationSession>): StepTransition {
    return { nextStep: session.step, outbound: [], expectsReply: false };
  }
}
