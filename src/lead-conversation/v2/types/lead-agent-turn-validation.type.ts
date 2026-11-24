/** Ids the LLM is allowed to reference; anything else in its answer is dropped. */
export type LeadAgentTurnValidation = {
  readonly allowedProjectIds: ReadonlySet<string>;
  readonly allowedFaqIds: ReadonlySet<string>;
};
