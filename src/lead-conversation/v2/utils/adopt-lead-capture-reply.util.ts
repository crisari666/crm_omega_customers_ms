import { REPLY_ID } from '../../constants/lead-conversation.constants';
import type { LeadProfile } from '../../types/lead-profile.type';

export type AdoptedLeadCapture = {
  readonly profilePatch: Partial<LeadProfile>;
  readonly metadataPatch: Record<string, string>;
  readonly field: 'timeToBuy' | 'paymentMethod' | 'urgencyLevel' | 'decisionMaker';
};

const TIME_BY_REPLY_ID: Readonly<Record<string, NonNullable<LeadProfile['timeline']>>> = {
  [REPLY_ID.timeImmediate]: 'immediate',
  [REPLY_ID.timeWithin30Days]: 'within_30_days',
  [REPLY_ID.timeWithin3Months]: 'within_3_months',
  [REPLY_ID.timeFuture]: 'future',
  [REPLY_ID.timeNotNow]: 'not_now',
};

const PAYMENT_BY_REPLY_ID: Readonly<
  Record<string, { readonly profile?: LeadProfile['paymentMethod']; readonly capture: string }>
> = {
  [REPLY_ID.paymentCash]: { profile: 'cash', capture: 'cash' },
  [REPLY_ID.paymentFinanced]: { profile: 'financed', capture: 'financing' },
  [REPLY_ID.paymentCashAndFinancing]: { profile: 'financed', capture: 'cash_and_financing' },
  [REPLY_ID.paymentSubsidy]: { profile: 'financed', capture: 'subsidy' },
};

const URGENCY_BY_REPLY_ID: Readonly<Record<string, string>> = {
  [REPLY_ID.urgencyLow]: 'low',
  [REPLY_ID.urgencyMedium]: 'medium',
  [REPLY_ID.urgencyHigh]: 'high',
};

const DECISION_BY_REPLY_ID: Readonly<Record<string, string>> = {
  [REPLY_ID.decisionSelf]: 'self',
  [REPLY_ID.decisionSpouse]: 'spouse',
  [REPLY_ID.decisionFamily]: 'family',
  [REPLY_ID.decisionOther]: 'other',
};

/** Adopts time / payment / urgency / decision interactive reply ids. */
export function adoptLeadCaptureFromReplyId(replyId: string | undefined): AdoptedLeadCapture | undefined {
  if (replyId === undefined) return undefined;
  const timeline = TIME_BY_REPLY_ID[replyId];
  if (timeline !== undefined) {
    const urgency =
      timeline === 'immediate' || timeline === 'within_30_days'
        ? 'high'
        : timeline === 'within_3_months'
          ? 'medium'
          : 'low';
    return {
      field: 'timeToBuy',
      profilePatch: { timeline },
      metadataPatch: { timeToBuy: timeline, urgencyLevel: urgency },
    };
  }
  const payment = PAYMENT_BY_REPLY_ID[replyId];
  if (payment !== undefined) {
    return {
      field: 'paymentMethod',
      profilePatch: payment.profile !== undefined ? { paymentMethod: payment.profile } : {},
      metadataPatch: { paymentMethod: payment.capture },
    };
  }
  const urgencyLevel = URGENCY_BY_REPLY_ID[replyId];
  if (urgencyLevel !== undefined) {
    return {
      field: 'urgencyLevel',
      profilePatch: {},
      metadataPatch: { urgencyLevel },
    };
  }
  const decisionMaker = DECISION_BY_REPLY_ID[replyId];
  if (decisionMaker !== undefined) {
    return {
      field: 'decisionMaker',
      profilePatch: {},
      metadataPatch: { decisionMaker },
    };
  }
  return undefined;
}
