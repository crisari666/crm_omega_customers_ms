/** Normalized inbound WhatsApp message from the lead qualification line. */
export type InboundLeadMessage = {
  readonly wamid: string;
  /**
   * Sendable WhatsApp phone digits when known; otherwise a synthetic key
   * (`meta:CO.…` / `username:handle`) for username-only Meta contacts.
   */
  readonly waId: string;
  /** False when Cloud API cannot send to `waId` (username-only / opaque Meta id). */
  readonly hasSendablePhone: boolean;
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
