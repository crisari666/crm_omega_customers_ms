import { LEAD_TEMPLATES } from '../templates/lead-conversation.templates';
import type { LeadCallPeriod } from '../types/lead-call-period.type';
import type { LeadPaymentMethod } from '../types/lead-conversation-answers.type';
import { REPLY_ID } from './lead-conversation.constants';

export const PAYMENT_BY_REPLY_ID: Readonly<Record<string, LeadPaymentMethod>> = {
  [REPLY_ID.paymentFinanced]: 'financed',
  [REPLY_ID.paymentCash]: 'cash',
};

export const SLOT_BY_REPLY_ID: Readonly<Record<string, LeadCallPeriod>> = {
  [REPLY_ID.slotMorning]: 'morning',
  [REPLY_ID.slotAfternoon]: 'afternoon',
  [REPLY_ID.slotNight]: 'night',
};

/** Button titles of the call period question (≤20 chars). */
export const SLOT_LABELS: Readonly<Record<LeadCallPeriod, string>> = {
  morning: LEAD_TEMPLATES.slotMorningOption,
  afternoon: LEAD_TEMPLATES.slotAfternoonOption,
  night: LEAD_TEMPLATES.slotNightOption,
};

export const PAYMENT_LABELS: Readonly<Record<LeadPaymentMethod, string>> = {
  financed: 'Financiado',
  cash: 'De contado',
};

/** customer_metadata `paymentMethod` option codes. */
export const PAYMENT_METADATA_CODES: Readonly<Record<LeadPaymentMethod, string>> = {
  financed: 'financing',
  cash: 'cash',
};
