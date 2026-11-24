/** Progress of the no-reply recovery sequence. */
export type LeadRecoveryState = {
  readonly anchorAt?: Date;
  readonly sentStepIds: string[];
};
