import type { VentorAssignmentCandidate } from '../../customer/types/ventor-assignment-candidate.type';

/** Result of booking a lead call slot; `booked: false` when every advance-leads user got busy meanwhile. */
export type BookCallSlotResult =
  | {
      readonly booked: true;
      readonly eventId: string;
      readonly userId: string;
      readonly scheduledAt: Date;
      readonly ventor?: VentorAssignmentCandidate;
    }
  | { readonly booked: false };
