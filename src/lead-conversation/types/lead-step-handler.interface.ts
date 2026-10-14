import type { LeadConversationStep } from './lead-conversation-step.enum';
import type { StepContext } from './step-context.type';
import type { StepTransition } from './step-transition.type';

/** Strategy for one conversation step. */
export interface LeadStepHandler {
  readonly steps: readonly LeadConversationStep[];
  handle(context: StepContext): Promise<StepTransition>;
}

export const LEAD_STEP_HANDLERS = 'LEAD_STEP_HANDLERS' as const;
