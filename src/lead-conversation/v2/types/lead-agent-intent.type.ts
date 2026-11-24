import type { LeadAgentLlmTurn } from './lead-agent-llm-turn.type';

/** Customer intent detected by the agent in one turn. */
export type LeadAgentIntent = LeadAgentLlmTurn['intents'][number];
