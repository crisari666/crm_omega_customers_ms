import type { LeadConversationAnswers } from './lead-conversation-answers.type';
import type { LeadConversationStatus } from './lead-conversation-status.type';
import type { LeadConversationStep } from './lead-conversation-step.enum';
import type { OutboundMessagePlan } from './outbound-message-plan.type';
import type { LeadScoreEvent } from './score-event.type';

export type StepSessionPatch = {
  readonly projectId?: string;
  readonly projectTitle?: string;
  readonly isAllProjects?: boolean;
  readonly stepBeforeReminder?: LeadConversationStep;
};

/**
 * Pure result of handling one inbound message in a step.
 * Persisted by LeadConversationSessionService, then dispatched.
 */
export type StepTransition = {
  readonly nextStep: LeadConversationStep;
  readonly status?: LeadConversationStatus;
  readonly answersPatch?: Partial<LeadConversationAnswers>;
  readonly sessionPatch?: StepSessionPatch;
  readonly scoreEvent?: LeadScoreEvent;
  readonly outbound: readonly OutboundMessagePlan[];
  /** True when the last outbound message is a question waiting for an answer (arms the reminder). */
  readonly expectsReply: boolean;
  readonly isRetry?: boolean;
  /** True when the call got scheduled (assign ventor + write customer_metadata). */
  readonly shouldQualify?: boolean;
};
