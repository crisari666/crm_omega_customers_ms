import { Injectable, Logger } from '@nestjs/common';
import { LEAD_AGENT_REPLY_GAP_MS, REPLY_ID } from '../constants/lead-conversation.constants';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { LEAD_TEMPLATES } from '../templates/lead-conversation.templates';
import type { OutboundMessagePlan } from '../types/outbound-message-plan.type';
import type {
  LeadAgentGuidedPathInput,
  LeadAgentGuidedPathOutbound,
} from './types/lead-agent-guided-path-input.type';
import { buildProjectFinancing } from './utils/build-project-financing.util';

const withReplyGap = (plans: readonly OutboundMessagePlan[]): OutboundMessagePlan[] =>
  plans.map((plan, index) => (index === 0 ? { ...plan, delayMs: plan.delayMs ?? LEAD_AGENT_REPLY_GAP_MS } : plan));

/**
 * Owns the deterministic V2 path after motive:
 * financed lot picker (monthly cuotas), cash ack, and FAQ next-step buttons.
 */
@Injectable()
export class LeadAgentGuidedPathService {
  private readonly logger = new Logger(LeadAgentGuidedPathService.name);

  constructor(private readonly transitions: LeadFlowTransitionsService) {}

  /** Builds financing lot picker + cash ack + next-step outbound for the current turn. */
  buildOutbound(input: LeadAgentGuidedPathInput): LeadAgentGuidedPathOutbound {
    const empty: LeadAgentGuidedPathOutbound = {
      financing: [],
      nextStep: [],
      cashAck: [],
      sentFinancing: false,
    };
    if (!input.hasConfirmedProject || input.isOnSlotStep || input.isBooked) {
      this.logger.log(
        `guidedPath skip confirmed=${input.hasConfirmedProject} slot=${input.isOnSlotStep} booked=${input.isBooked}`,
      );
      return empty;
    }
    if (input.action !== 'continue') {
      this.logger.log(`guidedPath skip action=${input.action}`);
      return empty;
    }
    const shouldSendFinancing = this.shouldSendFinancing(input);
    const financingPlans = shouldSendFinancing ? this.buildFinancingOutbound(input) : [];
    const sentFinancing = financingPlans.length > 0;
    const cashAck = this.buildCashAck(input, sentFinancing);
    const nextStep = this.buildNextStepButtons(input, sentFinancing, cashAck.length > 0);
    this.logger.log(
      `guidedPath pricePolicy=${input.pricePolicy} shouldSendFinancing=${shouldSendFinancing} ` +
        `sentFinancing=${sentFinancing} payment=${input.profile.paymentMethod ?? 'none'} ` +
        `lot=${input.profile.lotPreference ?? 'none'} financing=${financingPlans.length} ` +
        `cashAck=${cashAck.length} nextStep=${nextStep.length}`,
    );
    return {
      financing: withReplyGap(financingPlans),
      nextStep: nextStep.length > 0 ? withReplyGap(nextStep) : [],
      cashAck: cashAck.length > 0 ? withReplyGap(cashAck) : [],
      sentFinancing,
    };
  }

  /** Whether a `next:call` tap should force `offer_call_slots`. */
  shouldForceOfferCallSlots(replyId: string | undefined, canOfferCall: boolean): boolean {
    return replyId === REPLY_ID.nextCall && canOfferCall;
  }

  /** Whether Contado just became known and the schedule should open. */
  shouldForceScheduleAfterCash(input: {
    readonly paymentMethod?: string;
    readonly previousPaymentMethod?: string;
    readonly adoptedCaptureField?: string;
    readonly canOfferCall: boolean;
  }): boolean {
    if (!input.canOfferCall) return false;
    return (
      input.paymentMethod === 'cash' &&
      input.previousPaymentMethod !== 'cash' &&
      input.adoptedCaptureField === 'paymentMethod'
    );
  }

  /** Whether the pending reply is `next:question` (invite free-text). */
  isNextQuestionTap(replyId: string | undefined): boolean {
    return replyId === REPLY_ID.nextQuestion;
  }

  private shouldSendFinancing(input: LeadAgentGuidedPathInput): boolean {
    if (input.pricePolicy === 'defer_to_advisor') return false;
    if (input.profile.lotPreference !== undefined) return false;
    // Keep offering the lot picker until a size is chosen (not only on the first financed tap).
    if (input.profile.paymentMethod === 'financed') return true;
    return input.intents.includes('asked_price') || input.intents.includes('asked_financing');
  }

  private buildFinancingOutbound(input: LeadAgentGuidedPathInput): OutboundMessagePlan[] {
    const project = input.project;
    if (project === undefined) {
      return [{ kind: 'text', body: LEAD_TEMPLATES.financingMissingFallback }];
    }
    const financing =
      project.financing !== undefined && project.financing.plans.length > 0
        ? project.financing
        : buildProjectFinancing({
            lotOptions: project.lotOptions,
            separation: project.financing?.separation,
            maxInstallments: project.financing?.installments,
          });
    if (financing !== undefined && financing.plans.length > 0) {
      return [...this.transitions.buildFinancingLotPicker({ ...project, financing }).outbound];
    }
    return [{ kind: 'text', body: LEAD_TEMPLATES.financingMissingFallback }];
  }

  private buildCashAck(
    input: LeadAgentGuidedPathInput,
    sentFinancing: boolean,
  ): OutboundMessagePlan[] {
    if (sentFinancing) return [];
    const becameCash =
      input.profile.paymentMethod === 'cash' &&
      input.previousPaymentMethod !== 'cash' &&
      input.adoptedCaptureField === 'paymentMethod';
    if (!becameCash) return [];
    return [{ kind: 'text', body: LEAD_TEMPLATES.scheduleLeadCash }];
  }

  /**
   * FAQ / unanswered only — financed lot picker and Contado go to schedule without these buttons.
   */
  private buildNextStepButtons(
    input: LeadAgentGuidedPathInput,
    sentFinancing: boolean,
    sentCashAck: boolean,
  ): OutboundMessagePlan[] {
    if (!input.canOfferCall) return [];
    if (sentFinancing || sentCashAck) return [];
    const unanswered = (input.unansweredQuestion ?? '').trim().length > 0;
    const shouldOffer = input.usedFaqIds.length > 0 || unanswered;
    if (!shouldOffer) return [];
    const body = unanswered
      ? LEAD_TEMPLATES.offerCallNoAnswer
      : input.hasPrecedingText
        ? LEAD_TEMPLATES.askNextStepShort
        : LEAD_TEMPLATES.askNextStep;
    return [...this.transitions.buildAskNextStep(body).outbound];
  }
}
