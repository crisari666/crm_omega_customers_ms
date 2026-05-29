/** Meta Cloud API `messages` change `value` (gateway-forwarded). */
export type MetaWebhookMessagesValue = {
  metadata: { phone_number_id: string; display_phone_number?: string };
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: string;
    context?: { id?: string };
    text?: { body: string };
    button?: { text: string; payload?: string };
    interactive?: {
      type: string;
      nfm_reply?: { body?: string; response_json?: unknown };
    };
  }>;
  statuses?: Array<{
    id: string;
    status: string;
    timestamp: string;
    recipient_id: string;
  }>;
  contacts?: Array<{
    wa_id: string;
    profile?: { name?: string };
    user_id?: string;
  }>;
};
