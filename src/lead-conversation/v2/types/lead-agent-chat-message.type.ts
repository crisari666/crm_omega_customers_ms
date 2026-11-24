/** One chat-completion message handed to the agent LLM. */
export type LeadAgentChatMessage = {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
};
