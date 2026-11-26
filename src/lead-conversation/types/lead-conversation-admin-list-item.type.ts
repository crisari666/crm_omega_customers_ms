import type { LeadConversationStatus } from './lead-conversation-status.type';
import type { LeadConversationStep } from './lead-conversation-step.enum';
import type { LeadFlowVersion } from './lead-flow-version.type';
import type { LeadProfileStage } from './lead-profile.type';
import type { LeadTemperature } from './lead-temperature.type';

/** Row of the admin lead conversations list. */
export type LeadConversationAdminListItem = {
  readonly sessionId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly phone: string;
  readonly whatsappUsername?: string;
  readonly projectTitle?: string;
  readonly isAllProjects: boolean;
  readonly step: LeadConversationStep;
  readonly status: LeadConversationStatus;
  readonly score: number;
  readonly maxScore: number;
  readonly priority: number;
  readonly flowVersion: LeadFlowVersion;
  /** V2 only. */
  readonly temperature?: LeadTemperature;
  /** V2 only. */
  readonly stage?: LeadProfileStage;
  readonly lastInboundAt?: string;
  readonly startedAt?: string;
};
