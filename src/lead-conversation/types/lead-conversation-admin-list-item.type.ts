import type { LeadConversationStatus } from './lead-conversation-status.type';
import type { LeadConversationStep } from './lead-conversation-step.enum';

/** Row of the admin lead conversations list. */
export type LeadConversationAdminListItem = {
  readonly sessionId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly phone: string;
  readonly projectTitle?: string;
  readonly isAllProjects: boolean;
  readonly step: LeadConversationStep;
  readonly status: LeadConversationStatus;
  readonly score: number;
  readonly maxScore: number;
  readonly priority: number;
  readonly lastInboundAt?: string;
  readonly startedAt?: string;
};
