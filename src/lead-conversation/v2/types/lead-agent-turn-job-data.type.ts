/** BullMQ payload of the debounced V2 agent turn. */
export type LeadAgentTurnJobData = {
  readonly sessionId: string;
  /** Inbound message that armed this job; only the job of the latest inbound answers. */
  readonly wamid: string;
};
