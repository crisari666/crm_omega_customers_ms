import type { Types } from 'mongoose';
import type { LeadConversationAnswers } from '../../types/lead-conversation-answers.type';
import type { LeadConversationStatus } from '../../types/lead-conversation-status.type';
import type { LeadConversationStep } from '../../types/lead-conversation-step.enum';
import type { LeadProfile } from '../../types/lead-profile.type';
import type { OutboundOption } from '../../types/outbound-message-plan.type';

/** Read-only projection of a conversation session handed to the V2 engine (real or simulated). */
export type LeadAgentSessionView = {
  readonly firstName: string;
  readonly step: LeadConversationStep;
  readonly status: LeadConversationStatus;
  readonly projectId?: string;
  readonly projectTitle?: string;
  readonly isAllProjects?: boolean;
  readonly leadProfile: LeadProfile;
  readonly scoreSignals: readonly string[];
  readonly answers: LeadConversationAnswers;
  readonly pendingOptions: readonly OutboundOption[];
  readonly customerId?: Types.ObjectId;
};
