export type OutboundMessageKind = 'text' | 'image' | 'document' | 'buttons' | 'list';

export type OutboundOption = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
};

/** One WhatsApp message to send, with an optional pause before sending it. */
export type OutboundMessagePlan = {
  readonly kind: OutboundMessageKind;
  readonly body?: string;
  readonly mediaUrl?: string;
  readonly fileName?: string;
  readonly options?: readonly OutboundOption[];
  readonly listButtonLabel?: string;
  readonly delayMs?: number;
};
