export type LeadRecoveryScheduleInput = {
  readonly sessionId: string;
  /** ISO time of the last contact the offsets are measured from. */
  readonly anchorAt: string;
  readonly sentStepIds: readonly string[];
};
