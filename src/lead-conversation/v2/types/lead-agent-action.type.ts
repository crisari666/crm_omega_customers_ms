import type { LeadAgentLlmTurn } from './lead-agent-llm-turn.type';

/** What the agent wants the system to do after its replies. */
export type LeadAgentAction = LeadAgentLlmTurn['action'];
