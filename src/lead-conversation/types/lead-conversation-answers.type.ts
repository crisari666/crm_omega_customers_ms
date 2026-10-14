import type { LeadCallPeriod } from './lead-call-period.type';

export type LeadPaymentMethod = 'financed' | 'cash';

/** Answers collected during the qualification conversation. */
export type LeadConversationAnswers = {
  readonly rangoLote?: string;
  readonly formaPago?: LeadPaymentMethod;
  readonly horarioLlamada?: LeadCallPeriod;
  /** ISO start of the booked 30-minute call slot. */
  readonly fechaLlamada?: string;
};
