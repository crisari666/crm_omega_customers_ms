import type { LeadRecoveryStep } from './lead-recovery-step.type';

export type LeadRecoverySequenceView = {
  readonly steps: readonly LeadRecoveryStep[];
};
