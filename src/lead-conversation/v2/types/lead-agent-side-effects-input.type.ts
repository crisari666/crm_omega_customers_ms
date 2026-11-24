import type { LeadSessionSnapshot } from '../../lead-conversation-session.service';
import type { StepTransition } from '../../types/step-transition.type';

/** Everything the V2 side effects need after a transition was persisted. */
export type LeadAgentSideEffectsInput = {
  /** Session snapshot returned by `applyTransition` (already updated). */
  readonly session: LeadSessionSnapshot;
  readonly transition: StepTransition;
  readonly usedFaqIds?: readonly string[];
  readonly unansweredQuestion?: string;
};
