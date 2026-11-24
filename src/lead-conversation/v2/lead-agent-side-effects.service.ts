import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LeadFaqResolverService } from '../../lead-assistant/lead-faq-resolver.service';
import { LeadRecoveryScheduler } from '../../lead-assistant/lead-recovery.scheduler';
import { LeadUnansweredQuestionsService } from '../../lead-assistant/lead-unanswered-questions.service';
import {
  VentorScheduleEvent,
  VentorScheduleEventDocument,
  VentorScheduleEventStatus,
} from '../../ventor-schedule/schemas/ventor-schedule-event.schema';
import { LeadConversationSessionService, type LeadSessionSnapshot } from '../lead-conversation-session.service';
import { LeadCustomerService } from '../lead-customer.service';
import { LeadMessageDispatcherService } from '../lead-message-dispatcher.service';
import { LeadQualificationService } from '../lead-qualification.service';
import { LeadAgentLlmService } from './lead-agent-llm.service';
import type { LeadAgentBriefInput } from './types/lead-agent-brief-input.type';
import type { LeadAgentSideEffectsInput } from './types/lead-agent-side-effects-input.type';
import { buildLeadAgentBriefFallback } from './utils/build-lead-agent-brief-fallback.util';

/**
 * Effects of a persisted V2 transition: interested project, qualification, outbound dispatch,
 * FAQ usage, unanswered question log, recovery scheduling and the advisor brief.
 * Everything except the dispatch is best effort so one failure never blocks the reply.
 */
@Injectable()
export class LeadAgentSideEffectsService {
  private readonly logger = new Logger(LeadAgentSideEffectsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly leadCustomer: LeadCustomerService,
    private readonly qualification: LeadQualificationService,
    private readonly dispatcher: LeadMessageDispatcherService,
    private readonly faqResolver: LeadFaqResolverService,
    private readonly unansweredQuestions: LeadUnansweredQuestionsService,
    private readonly recoveryScheduler: LeadRecoveryScheduler,
    private readonly llm: LeadAgentLlmService,
    private readonly sessionService: LeadConversationSessionService,
    @InjectModel(VentorScheduleEvent.name)
    private readonly scheduleEventModel: Model<VentorScheduleEventDocument>,
  ) {}

  /** Runs every side effect of a V2 transition that was already persisted on `session`. */
  async executeRun(input: LeadAgentSideEffectsInput): Promise<void> {
    const { session, transition } = input;
    const projectId = transition.sessionPatch?.projectId;
    if (projectId) {
      await this.executeSafely('add interested project', () =>
        this.leadCustomer.addInterestedProject(session.customerId, projectId, this.getActorUserId()),
      );
    }
    if (transition.shouldQualify) {
      await this.executeSafely('qualification', () => this.qualification.executeQualify(session));
    }
    await this.dispatcher.executeDispatch({
      sessionId: String(session._id),
      customerId: String(session.customerId),
      to: session.waId,
      messages: transition.outbound,
    });
    await this.executeMarkFaqsUsed(input);
    await this.executeLogUnanswered(input);
    if (session.status === 'active') {
      await this.executeSafely('recovery schedule', () => this.executeScheduleRecovery(session));
    }
    if (transition.status === 'scheduled') {
      await this.executeSafely('advisor brief', () => this.executeStoreAdvisorBrief(session));
    }
  }

  private async executeMarkFaqsUsed({ usedFaqIds }: LeadAgentSideEffectsInput): Promise<void> {
    if (!usedFaqIds || usedFaqIds.length === 0) return;
    await this.executeSafely('mark FAQs used', () => this.faqResolver.executeMarkUsed(usedFaqIds));
  }

  private async executeLogUnanswered({ session, unansweredQuestion }: LeadAgentSideEffectsInput): Promise<void> {
    if (!unansweredQuestion) return;
    await this.executeSafely('log unanswered question', () =>
      this.unansweredQuestions.executeCreate({
        question: unansweredQuestion,
        sessionId: String(session._id),
        customerId: String(session.customerId),
        ...(session.projectId ? { projectId: session.projectId } : {}),
        ...(session.projectTitle ? { projectTitle: session.projectTitle } : {}),
      }),
    );
  }

  private async executeScheduleRecovery(session: LeadSessionSnapshot): Promise<void> {
    const anchorAt = session.recovery?.anchorAt ?? new Date();
    await this.recoveryScheduler.executeScheduleNext({
      sessionId: String(session._id),
      anchorAt: new Date(anchorAt).toISOString(),
      sentStepIds: session.recovery?.sentStepIds ?? [],
    });
  }

  /** LLM brief with a profile-based fallback; saved on the session and as note of the pending call events. */
  private async executeStoreAdvisorBrief(session: LeadSessionSnapshot): Promise<void> {
    const briefInput: LeadAgentBriefInput = {
      profile: session.leadProfile ?? {},
      ...(session.projectTitle ? { projectTitle: session.projectTitle } : {}),
      answers: session.answers ?? {},
    };
    const brief = (await this.llm.executeBrief(briefInput)) ?? buildLeadAgentBriefFallback(briefInput);
    await this.sessionService.setAdvisorBrief(session._id, brief);
    await this.scheduleEventModel
      .updateMany(
        { leadConversationSessionId: session._id, status: VentorScheduleEventStatus.Pending },
        { $set: { note: brief } },
      )
      .exec();
  }

  private async executeSafely(label: string, action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (err: unknown) {
      this.logger.error(`Lead agent side effect "${label}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private getActorUserId(): string {
    return this.configService.get<string>('leadConversation.actorUserId', 'lead-conversation-bot');
  }
}
