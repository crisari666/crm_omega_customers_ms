import type { OutboundMessagePlan } from '../../types/outbound-message-plan.type';
import type { LeadAgentMediaKind } from './lead-agent-media-kind.type';

/** Outbound plans for the media sent this turn and which media kinds they cover. */
export type LeadAgentMediaPlans = {
  readonly plans: OutboundMessagePlan[];
  readonly sent: LeadAgentMediaKind[];
};
