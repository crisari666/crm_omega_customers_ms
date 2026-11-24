/** omega_gateway → customers-ms (Meta WhatsApp webhook of the lead qualification line). */
export const LEAD_CONVERSATION_INBOUND_PATTERN = 'customers.lead_conversation.inbound.v1' as const;

/** customers-ms → whatsapp_cloud_ms RPC (returns `{ success, wamid }`). */
export const LEAD_CONVERSATION_SEND_PATTERN = 'lead_conversation.send.v1' as const;

/** customers-ms → whatsapp_cloud_ms: mark an inbound message as read and show the typing indicator. */
export const LEAD_CONVERSATION_MARK_READ_PATTERN = 'lead_conversation.mark_read.v1' as const;

/** customers-ms → whatsapp_cloud_ms: list approved templates of the leads line. */
export const LEAD_CONVERSATION_TEMPLATES_LIST_PATTERN = 'lead_conversation.templates.list.v1' as const;

/** Nest injection token for the RabbitMQ client bound to `ws_ms_queue`. */
export const LEAD_WS_MS_CLIENT = 'LEAD_WS_MS_CLIENT' as const;

export const LEAD_OUTBOUND_QUEUE = 'lead-conversation-outbound' as const;
export const LEAD_REMINDER_QUEUE = 'lead-conversation-reminder' as const;
export const LEAD_OUTBOUND_JOB = 'send-sequence' as const;
export const LEAD_REMINDER_JOB = 'no-reply-reminder' as const;

export const LEAD_AGENT_TURN_QUEUE = 'lead-agent-turn' as const;
export const LEAD_AGENT_TURN_JOB = 'agent-turn' as const;
export const LEAD_AGENT_RECOVERY_QUEUE = 'lead-agent-recovery' as const;
export const LEAD_AGENT_RECOVERY_JOB = 'recovery-step' as const;

export const LEAD_SEND_RPC_TIMEOUT_MS = 15000 as const;
export const PROJECT_CATALOG_TTL_MS = 10 * 60 * 1000;
export const PAUSE_BEFORE_PLAN_MS = 3000 as const;
export const PAUSE_BEFORE_LOT_RANGES_MS = 4000 as const;
/** Pause between booking confirmation text and the ventor contact card. */
export const PAUSE_BEFORE_VENTOR_CONTACT_MS = 1200 as const;
export const MAX_REPLY_BUTTONS = 3 as const;
export const MAX_QUESTION_RETRIES = 2 as const;
export const MAX_SCORE = 6 as const;
/** Maximum score of the V2 (agent) flow. */
export const MAX_SCORE_V2 = 100 as const;
/** Pause between consecutive agent reply messages. */
export const LEAD_AGENT_REPLY_GAP_MS = 1500 as const;
/** Transcript messages given to the agent as context. */
export const LEAD_AGENT_HISTORY_LIMIT = 20 as const;
/** Hours without reply after which the recovery sequence closes the conversation. */
export const RECOVERY_CLOSE_AFTER_HOURS = 48 as const;
/** Meta customer-service window: free-form messages are only allowed this long after the last inbound. */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Interactive reply ids (stable contract between composer and handlers). */
export const REPLY_ID = {
  projectPrefix: 'project:',
  allProjects: 'project:all',
  lotPrefix: 'lot:',
  motivationBuild: 'mot:build',
  motivationInvest: 'mot:invest',
  motivationExploring: 'mot:exploring',
  paymentFinanced: 'pay:financed',
  paymentCash: 'pay:cash',
  paymentCashAndFinancing: 'pay:cash_and_financing',
  paymentSubsidy: 'pay:subsidy',
  timeImmediate: 'time:immediate',
  timeWithin30Days: 'time:within_30_days',
  timeWithin3Months: 'time:within_3_months',
  timeFuture: 'time:future',
  timeNotNow: 'time:not_now',
  urgencyLow: 'urgency:low',
  urgencyMedium: 'urgency:medium',
  urgencyHigh: 'urgency:high',
  decisionSelf: 'decision:self',
  decisionSpouse: 'decision:spouse',
  decisionFamily: 'decision:family',
  decisionOther: 'decision:other',
  slotMorning: 'slot:morning',
  slotAfternoon: 'slot:afternoon',
  slotNight: 'slot:night',
  reminderYes: 'reminder:yes',
  reminderNo: 'reminder:no',
  nextQuestion: 'next:question',
  nextCall: 'next:call',
} as const;
