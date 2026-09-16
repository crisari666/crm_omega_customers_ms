import type { CustomerEventType } from '../schemas/customer-event.schema';

export type CustomerMineEventTypeCount = {
  readonly eventType: CustomerEventType;
  /** Distinct customers with at least one event of this type (not raw row count). */
  readonly count: number;
};

export type CustomerMineEventsSummaryResponse = {
  readonly items: CustomerMineEventTypeCount[];
};
