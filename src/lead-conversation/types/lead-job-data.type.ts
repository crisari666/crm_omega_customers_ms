import type { OutboundMessagePlan } from './outbound-message-plan.type';

/** BullMQ payload: send `messages[index]`, then chain the next one after its `delayMs`. */
export type LeadOutboundJobData = {
  readonly sessionId: string;
  readonly customerId: string;
  readonly to: string;
  readonly messages: readonly OutboundMessagePlan[];
  readonly index: number;
  /** ISO time of the question; when set, the no-reply reminder is armed after the last message. */
  readonly questionAt?: string;
};

export type LeadReminderJobData = {
  readonly sessionId: string;
  readonly questionAt: string;
};
