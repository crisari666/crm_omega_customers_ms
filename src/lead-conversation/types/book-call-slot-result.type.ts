/** Result of booking a lead call slot; `booked: false` when every advance-leads user got busy meanwhile. */
export type BookCallSlotResult =
  | {
      readonly booked: true;
      readonly eventId: string;
      readonly userId: string;
      readonly scheduledAt: Date;
    }
  | { readonly booked: false };
