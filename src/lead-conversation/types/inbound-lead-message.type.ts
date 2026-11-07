/** Normalized inbound WhatsApp message from the lead qualification line. */
export type InboundLeadMessage = {
  readonly wamid: string;
  /** Sendable WhatsApp phone digits (never Meta `CO.…` user ids). */
  readonly waId: string;
  readonly phoneNumberId: string;
  readonly profileName: string;
  readonly type: string;
  readonly text: string;
  readonly replyId?: string;
  readonly timestamp: Date;
  readonly email?: string;
  readonly whatsappUsername?: string;
  readonly metaWhatsappUserId?: string;
  readonly ctwaClid?: string;
  /** True when the body is a Meta Instant Form / CTWA form dump (identity bootstrap). */
  readonly isInstantFormDump?: boolean;
};
