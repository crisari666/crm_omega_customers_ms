/** Normalized inbound WhatsApp message from the lead qualification line. */
export type InboundLeadMessage = {
  readonly wamid: string;
  readonly waId: string;
  readonly phoneNumberId: string;
  readonly profileName: string;
  readonly type: string;
  readonly text: string;
  readonly replyId?: string;
  readonly timestamp: Date;
};
