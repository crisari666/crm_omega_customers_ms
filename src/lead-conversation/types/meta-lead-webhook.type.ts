/** Subset of the Meta WhatsApp Cloud webhook used by the lead conversation line. */
export type MetaLeadWebhookMessage = {
  readonly id: string;
  readonly from: string;
  readonly timestamp: string;
  readonly type: string;
  readonly text?: { readonly body?: string };
  readonly button?: { readonly text?: string; readonly payload?: string };
  readonly interactive?: {
    readonly type?: string;
    readonly button_reply?: { readonly id?: string; readonly title?: string };
    readonly list_reply?: { readonly id?: string; readonly title?: string; readonly description?: string };
  };
  readonly image?: { readonly caption?: string };
  readonly document?: { readonly caption?: string };
};

export type MetaLeadWebhookValue = {
  readonly metadata?: { readonly phone_number_id?: string };
  readonly contacts?: readonly { readonly wa_id?: string; readonly profile?: { readonly name?: string } }[];
  readonly messages?: readonly MetaLeadWebhookMessage[];
};

export type MetaLeadWebhookBody = {
  readonly entry?: readonly { readonly changes?: readonly { readonly field?: string; readonly value?: MetaLeadWebhookValue }[] }[];
};

/** Envelope emitted by omega_gateway. */
export type LeadConversationIngressEnvelope = {
  readonly source?: string;
  readonly receivedAt?: string;
  readonly payload?: MetaLeadWebhookBody;
};
