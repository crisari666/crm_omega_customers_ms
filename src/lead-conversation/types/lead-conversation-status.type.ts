export const LEAD_CONVERSATION_STATUSES = ['active', 'scheduled', 'disqualified', 'abandoned'] as const;

export type LeadConversationStatus = (typeof LEAD_CONVERSATION_STATUSES)[number];
