import { Injectable } from '@nestjs/common';
import { REPLY_ID } from '../constants/lead-conversation.constants';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { ProjectCatalogService } from '../project-catalog.service';
import { ProjectMatcherService } from '../project-matcher.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadProject } from '../types/lead-project.type';
import type { LeadStepHandler } from '../types/lead-step-handler.interface';
import type { StepContext } from '../types/step-context.type';
import type { StepTransition } from '../types/step-transition.type';

/** Customer picks a project from the list, or "Me interesan todos" (jumps to scheduling). */
@Injectable()
export class AskProjectHandler implements LeadStepHandler {
  readonly steps = [LeadConversationStep.AskProject] as const;

  constructor(
    private readonly catalog: ProjectCatalogService,
    private readonly matcher: ProjectMatcherService,
    private readonly transitions: LeadFlowTransitionsService,
  ) {}

  async handle({ session, message, selectedOption }: StepContext): Promise<StepTransition> {
    if (selectedOption?.id === REPLY_ID.allProjects) {
      return this.transitions.buildAskSchedule(undefined, true);
    }
    const project = await this.resolveProject(selectedOption?.id, message.text);
    return project ? this.transitions.buildProjectIntro(session, project) : this.transitions.buildRetry(session);
  }

  private async resolveProject(optionId: string | undefined, text: string): Promise<LeadProject | undefined> {
    if (optionId?.startsWith(REPLY_ID.projectPrefix)) {
      return this.catalog.findProjectById(optionId.slice(REPLY_ID.projectPrefix.length));
    }
    return this.matcher.findProjectInText(text);
  }
}
