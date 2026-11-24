/** Input used by the agent flow to log a question it could not answer. */
export type LeadUnansweredQuestionCreateInput = {
  readonly question: string;
  readonly sessionId: string;
  readonly customerId: string;
  readonly projectId?: string;
  readonly projectTitle?: string;
};
