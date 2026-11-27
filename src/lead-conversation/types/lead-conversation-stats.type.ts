import type { LeadConversationStatsBucket } from './lead-conversation-stats-bucket.type';

/** Admin aggregate of lead conversations in a `createdAt` range. */
export type LeadConversationStats = {
  readonly total: number;
  readonly byStep: readonly LeadConversationStatsBucket[];
  readonly byTemperature: readonly LeadConversationStatsBucket[];
};
