import { Injectable } from '@nestjs/common';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { ProjectMatcherService } from '../project-matcher.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadStepHandler } from '../types/lead-step-handler.interface';
import type { StepContext } from '../types/step-context.type';
import type { StepTransition } from '../types/step-transition.type';

/** First customer message: detect the project of interest or ask for it. */
@Injectable()
export class InitialHandler implements LeadStepHandler {
  readonly steps = [LeadConversationStep.Initial] as const;

  constructor(
    private readonly matcher: ProjectMatcherService,
    private readonly transitions: LeadFlowTransitionsService,
  ) {}

  async handle({ session, message }: StepContext): Promise<StepTransition> {
    const project = await this.matcher.findProjectInText(message.text);
    return project
      ? this.transitions.buildProjectIntro(session, project)
      : this.transitions.buildAskProject(session);
  }
}
