import type { OutboundMessageKind, OutboundOption } from '../../types/outbound-message-plan.type';

/** One assistant message of a simulated turn (what WhatsApp would have received). */
export type LeadAgentSimulatedReply = {
  readonly kind: OutboundMessageKind;
  readonly body?: string;
  readonly options?: readonly OutboundOption[];
  readonly mediaUrl?: string;
};
