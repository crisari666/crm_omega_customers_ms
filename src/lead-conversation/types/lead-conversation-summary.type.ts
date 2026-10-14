import type { LeadConversationAnswers } from './lead-conversation-answers.type';
import type { LeadConversationStatus } from './lead-conversation-status.type';
import type { LeadConversationStep } from './lead-conversation-step.enum';

export type LeadConversationSummaryItem = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
};

/** `GET /customer/:customerId/lead-conversation` response. */
export type LeadConversationSummary = {
  readonly customerId: string;
  readonly hasSession: boolean;
  readonly sessionId?: string;
  readonly step?: LeadConversationStep;
  readonly status?: LeadConversationStatus;
  readonly score: number;
  readonly maxScore: number;
  readonly priority: number;
  readonly projectId?: string;
  readonly projectTitle?: string;
  readonly isAllProjects: boolean;
  readonly answers: LeadConversationAnswers;
  readonly items: readonly LeadConversationSummaryItem[];
  readonly assignedVentorId?: string;
  readonly scheduledAt?: string;
  readonly lastInboundAt?: string;
  readonly startedAt?: string;
};
