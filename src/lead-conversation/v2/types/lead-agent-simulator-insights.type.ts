import type { LeadProfile, LeadProfileStage } from '../../types/lead-profile.type';
import type { LeadTemperature } from '../../types/lead-temperature.type';

/** What the agent understood and scored in a simulated turn. */
export type LeadAgentSimulatorInsights = {
  readonly stage: LeadProfileStage;
  readonly profile: LeadProfile;
  readonly score: number;
  readonly maxScore: number;
  readonly temperature: LeadTemperature;
  readonly signals: readonly string[];
  readonly usedFaqs: readonly { readonly id: string; readonly question: string }[];
  readonly unansweredQuestion?: string;
};
