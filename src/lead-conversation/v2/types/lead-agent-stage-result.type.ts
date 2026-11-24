import type { LeadProfileStage } from '../../types/lead-profile.type';

/** Stage of the conversation and turns spent in it. */
export type LeadAgentStageResult = {
  readonly stage: LeadProfileStage;
  readonly stageTurns: number;
};
