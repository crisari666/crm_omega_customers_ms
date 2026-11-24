import type { StepTransition } from '../../types/step-transition.type';

/** Result of one V2 agent turn: pure data, nothing persisted or sent yet. */
export type LeadAgentTurnOutcome = {
  /** Never carries a `scoreEvent` (V2 scores by signals). */
  readonly transition: StepTransition;
  readonly usedFaqIds: readonly string[];
  readonly unansweredQuestion?: string;
  /** Incremental Stage-3 capture values for side-effect upsert. */
  readonly capturePatch?: Readonly<Record<string, string>>;
};
