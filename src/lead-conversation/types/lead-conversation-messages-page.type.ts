export type LeadConversationMessageItem = {
  readonly id: string;
  readonly direction: 'inbound' | 'outbound';
  readonly kind: string;
  readonly body: string;
  readonly options: readonly string[];
  readonly mediaUrl?: string;
  readonly delivered: boolean;
  readonly timestamp: string;
};

/** `GET /customer/:customerId/lead-conversation/messages` response (oldest → newest). */
export type LeadConversationMessagesPage = {
  readonly items: readonly LeadConversationMessageItem[];
  /** Pass as `before` to load older messages; absent when there are no more. */
  readonly nextBefore?: string;
};
