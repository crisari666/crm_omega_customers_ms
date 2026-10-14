import type { VentorScheduleEventSource, VentorScheduleEventStatus } from '../../ventor-schedule/schemas/ventor-schedule-event.schema';

/** Row of `GET /admin/customer/lead-calls/agenda`: a `call` schedule event with customer, ventor and lead score. */
export type LeadCallAdminItem = {
  readonly eventId: string;
  readonly scheduledAt: string;
  readonly status: VentorScheduleEventStatus;
  readonly source: VentorScheduleEventSource;
  readonly userId: string;
  readonly ventorName: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly phone: string;
  readonly sessionId?: string;
  readonly score?: number;
  readonly maxScore: number;
  readonly priority?: number;
  readonly projectTitle?: string;
  readonly note?: string;
};
