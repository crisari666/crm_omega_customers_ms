import { Injectable } from '@nestjs/common';
import { LeadAdProjectResolverService } from '../lead-ad-project-resolver.service';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { ProjectMatcherService } from '../project-matcher.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadStepHandler } from '../types/lead-step-handler.interface';
import type { StepContext } from '../types/step-context.type';
import type { StepTransition } from '../types/step-transition.type';
import { isInstantFormDump } from '../utils/extract-form-fields-from-lead-text.util';

/** First customer message: detect the project of interest or ask for it. */
@Injectable()
export class InitialHandler implements LeadStepHandler {
  readonly steps = [LeadConversationStep.Initial] as const;

  constructor(
    private readonly matcher: ProjectMatcherService,
    private readonly transitions: LeadFlowTransitionsService,
    private readonly adProjectResolver: LeadAdProjectResolverService,
  ) {}

  async handle({ session, message }: StepContext): Promise<StepTransition> {
    if (message.isInstantFormDump === true || isInstantFormDump(message.text)) {
      const mappedProject = await this.adProjectResolver.executeResolveForCustomer(
        session.customerId,
      );
      if (mappedProject != null) {
        const transition = await this.transitions.buildProjectIntro(
          session,
          mappedProject,
        );
        return {
          ...transition,
          sessionPatch: {
            ...transition.sessionPatch,
            identityBootstrappedFromForm: true,
          },
        };
      }
      const transition = await this.transitions.buildAskProject(session);
      return {
        ...transition,
        sessionPatch: { ...transition.sessionPatch, identityBootstrappedFromForm: true },
      };
    }
    const project = await this.matcher.findProjectInText(message.text);
    return project
      ? this.transitions.buildProjectIntro(session, project)
      : this.transitions.buildAskProject(session);
  }
}
