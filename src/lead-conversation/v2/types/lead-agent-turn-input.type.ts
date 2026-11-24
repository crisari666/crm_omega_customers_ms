import type { LeadAgentHistoryMessage } from './lead-agent-history-message.type';
import type { LeadAgentPendingMessage } from './lead-agent-pending-message.type';
import type { LeadAgentSessionView } from './lead-agent-session-view.type';

/** Input of one V2 agent turn. */
export type LeadAgentTurnInput = {
  readonly session: LeadAgentSessionView;
  readonly history: readonly LeadAgentHistoryMessage[];
  readonly pendingMessages: readonly LeadAgentPendingMessage[];
};
