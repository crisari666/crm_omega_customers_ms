import type { LeadAgentSimulatedReply } from './lead-agent-simulated-reply.type';
import type { LeadAgentSimulatorInsights } from './lead-agent-simulator-insights.type';
import type { SimulatedLeadState } from './simulated-lead-state.type';

/** Response of the admin simulator: replies, the state to send back next turn, and insights. */
export type LeadAgentSimulateResponse = {
  readonly replies: readonly LeadAgentSimulatedReply[];
  readonly state: SimulatedLeadState;
  readonly insights: LeadAgentSimulatorInsights;
};
