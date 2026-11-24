/** Delivery status update for an outbound message (Meta `statuses`). */
export type InboundLeadStatus = {
  readonly wamid: string;
  readonly status: string;
  readonly timestamp: Date;
  readonly errorCode?: number;
  readonly errorTitle?: string;
};
