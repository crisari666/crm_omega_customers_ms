/** One past transcript message given to the agent as context. */
export type LeadAgentHistoryMessage = {
  readonly direction: 'inbound' | 'outbound';
  readonly body: string;
};
