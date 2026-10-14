/** omega_gateway → customers-ms (Meta WhatsApp webhook of the lead qualification line). */
export const LEAD_CONVERSATION_INBOUND_PATTERN = 'customers.lead_conversation.inbound.v1' as const;

/** customers-ms → whatsapp_cloud_ms RPC (returns `{ success, wamid }`). */
export const LEAD_CONVERSATION_SEND_PATTERN = 'lead_conversation.send.v1' as const;

/** Nest injection token for the RabbitMQ client bound to `ws_ms_queue`. */
export const LEAD_WS_MS_CLIENT = 'LEAD_WS_MS_CLIENT' as const;

export const LEAD_OUTBOUND_QUEUE = 'lead-conversation-outbound' as const;
export const LEAD_REMINDER_QUEUE = 'lead-conversation-reminder' as const;
export const LEAD_OUTBOUND_JOB = 'send-sequence' as const;
export const LEAD_REMINDER_JOB = 'no-reply-reminder' as const;

export const LEAD_SEND_RPC_TIMEOUT_MS = 15000 as const;
export const PROJECT_CATALOG_TTL_MS = 10 * 60 * 1000;
export const PAUSE_BEFORE_PLAN_MS = 3000 as const;
export const PAUSE_BEFORE_LOT_RANGES_MS = 4000 as const;
export const MAX_REPLY_BUTTONS = 3 as const;
export const MAX_QUESTION_RETRIES = 2 as const;
export const MAX_SCORE = 6 as const;
/** Meta customer-service window: free-form messages are only allowed this long after the last inbound. */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Interactive reply ids (stable contract between composer and handlers). */
export const REPLY_ID = {
  projectPrefix: 'project:',
  allProjects: 'project:all',
  lotPrefix: 'lot:',
  paymentFinanced: 'pay:financed',
  paymentCash: 'pay:cash',
  slotMorning: 'slot:morning',
  slotAfternoon: 'slot:afternoon',
  slotNight: 'slot:night',
  reminderYes: 'reminder:yes',
  reminderNo: 'reminder:no',
} as const;
