/** BullMQ payload of the recovery queue; `stepId: null` is the closing job. */
export type LeadRecoveryJobData = {
  readonly sessionId: string;
  readonly stepId: string | null;
  readonly anchorAt: string;
};
