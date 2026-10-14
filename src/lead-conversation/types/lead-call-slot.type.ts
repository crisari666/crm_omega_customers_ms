import type { LeadCallPeriod } from './lead-call-period.type';

/** Free 30-minute call slot offered to the customer. */
export type LeadCallSlot = {
  readonly start: Date;
  readonly period: LeadCallPeriod;
};
