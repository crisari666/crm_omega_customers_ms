import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LeadAssistantSettingsService } from '../../lead-assistant/lead-assistant-settings.service';
import { LeadRecoverySequenceService } from '../../lead-assistant/lead-recovery-sequence.service';
import { LeadRecoveryScheduler } from '../../lead-assistant/lead-recovery.scheduler';
import { LeadTemplateRendererService } from '../../lead-assistant/lead-template-renderer.service';
import type { LeadRecoveryJobData } from '../../lead-assistant/types/lead-recovery-job-data.type';
import type { LeadRecoveryStep } from '../../lead-assistant/types/lead-recovery-step.type';
import { LEAD_AGENT_RECOVERY_QUEUE } from '../constants/lead-conversation.constants';
import { LeadConversationSessionService, type LeadSessionSnapshot } from '../lead-conversation-session.service';
import { LeadMessageDispatcherService } from '../lead-message-dispatcher.service';
import type { OutboundMessagePlan } from '../types/outbound-message-plan.type';

/**
 * Sends the no-reply follow-ups (WhatsApp templates) of a V2 session, then closes it as abandoned.
 * Every job re-checks the session, so a stale job (customer replied, new anchor, V2 disabled) is a no-op.
 */
@Processor(LEAD_AGENT_RECOVERY_QUEUE)
export class LeadAgentRecoveryProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadAgentRecoveryProcessor.name);

  constructor(
    private readonly sessionService: LeadConversationSessionService,
    private readonly settingsService: LeadAssistantSettingsService,
    private readonly sequenceService: LeadRecoverySequenceService,
    private readonly recoveryScheduler: LeadRecoveryScheduler,
    private readonly templateRenderer: LeadTemplateRendererService,
    private readonly dispatcher: LeadMessageDispatcherService,
  ) {
    super();
  }

  async process(job: Job<LeadRecoveryJobData>): Promise<void> {
    const { sessionId, stepId, anchorAt } = job.data;
    const session = await this.sessionService.findById(sessionId);
    if (!session || !(await this.isRecoverable(session, anchorAt))) return;
    if (stepId === null) {
      await this.sessionService.markAbandoned(session._id);
      this.logger.log(`Lead session ${sessionId} closed as abandoned after recovery sequence`);
      return;
    }
    const step = await this.sequenceService.findStep(stepId);
    if (!step || !step.enabled) {
      await this.executeScheduleNext(session, anchorAt, session.recovery?.sentStepIds ?? []);
      return;
    }
    await this.executeSendStep(session, step, anchorAt);
  }

  private async isRecoverable(session: LeadSessionSnapshot, anchorAt: string): Promise<boolean> {
    if (session.flowVersion !== 'v2' || session.status !== 'active' || session.optedOutAt) return false;
    if (!this.isSameAnchor(session.recovery?.anchorAt, anchorAt)) return false;
    return (await this.settingsService.executeGetOrCreate()).enabled;
  }

  private isSameAnchor(sessionAnchorAt: Date | string | undefined, jobAnchorAt: string): boolean {
    if (!sessionAnchorAt) return false;
    return new Date(sessionAnchorAt).getTime() === new Date(jobAnchorAt).getTime();
  }

  private async executeSendStep(session: LeadSessionSnapshot, step: LeadRecoveryStep, anchorAt: string): Promise<void> {
    await this.dispatcher.executeDispatch({
      sessionId: String(session._id),
      customerId: String(session.customerId),
      to: session.waId,
      messages: [await this.buildTemplatePlan(session, step)],
    });
    await this.sessionService.addRecoverySentStep(session._id, step.id);
    await this.sequenceService.executeIncrementSent(step.id);
    await this.executeScheduleNext(session, anchorAt, [...(session.recovery?.sentStepIds ?? []), step.id]);
  }

  private async buildTemplatePlan(session: LeadSessionSnapshot, step: LeadRecoveryStep): Promise<OutboundMessagePlan> {
    const settings = await this.settingsService.executeGetOrCreate();
    const { templateComponents, renderedBody } = this.templateRenderer.executeRender(step.template, {
      firstName: session.firstName,
      assistantName: settings.assistantName,
      businessName: settings.businessName,
      projectTitle: session.projectTitle,
    });
    return {
      kind: 'template',
      body: renderedBody,
      templateName: step.template.name,
      languageCode: step.template.language,
      templateComponents,
    };
  }

  private async executeScheduleNext(
    session: LeadSessionSnapshot,
    anchorAt: string,
    sentStepIds: readonly string[],
  ): Promise<void> {
    await this.recoveryScheduler.executeScheduleNext({ sessionId: String(session._id), anchorAt, sentStepIds });
  }
}
