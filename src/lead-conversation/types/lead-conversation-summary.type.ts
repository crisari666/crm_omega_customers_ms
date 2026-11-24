import type { LeadConversationAnswers } from './lead-conversation-answers.type';
import type { LeadConversationStatus } from './lead-conversation-status.type';
import type { LeadScoreSegment } from '../v2/types/lead-score-segment.type';
import type { LeadConversationStep } from './lead-conversation-step.enum';
import type { LeadFlowVersion } from './lead-flow-version.type';
import type { LeadProfileStage } from './lead-profile.type';
import type { LeadTemperature } from './lead-temperature.type';

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
  readonly flowVersion: LeadFlowVersion;
  /** V2 only. */
  readonly temperature?: LeadTemperature;
  /** V2 only. */
  readonly stage?: LeadProfileStage;
  /** V2 only: Spanish brief written for the advisor who calls the lead. */
  readonly advisorBrief?: string;
  /** V2 only: score breakdown for the score bar. */
  readonly scoreSegments?: readonly LeadScoreSegment[];
  readonly answers: LeadConversationAnswers;
  readonly items: readonly LeadConversationSummaryItem[];
  readonly assignedVentorId?: string;
  readonly scheduledAt?: string;
  readonly lastInboundAt?: string;
  readonly startedAt?: string;
};
