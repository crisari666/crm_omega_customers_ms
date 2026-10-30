import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaLeadFormQualificationScheduler } from '../meta-lead-forms/meta-lead-form-qualification.scheduler';
import { LeadConversationMessageLogService } from './lead-conversation-message-log.service';
import { LeadConversationSessionService, type LeadSessionSnapshot } from './lead-conversation-session.service';
import { LeadConversationStateMachineService } from './lead-conversation-state-machine.service';
import { LeadCustomerService } from './lead-customer.service';
import { LeadMessageDispatcherService } from './lead-message-dispatcher.service';
import { LeadQualificationService } from './lead-qualification.service';
import { LeadReminderScheduler } from './lead-reminder.scheduler';
import type { InboundLeadMessage } from './types/inbound-lead-message.type';
import type { StepTransition } from './types/step-transition.type';
import { parseMetaLeadMessages } from './utils/parse-meta-lead-messages.util';

const MAX_TRANSITION_ATTEMPTS = 3 as const;

type AppliedTransition = { readonly session: LeadSessionSnapshot; readonly transition: StepTransition };

/**
 * Orchestrates one inbound webhook: customer + session upsert, idempotent transcript,
 * state machine transition (optimistic lock), qualification and outbound dispatch.
 */
@Injectable()
export class LeadConversationInboundService {
  private readonly logger = new Logger(LeadConversationInboundService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly leadCustomer: LeadCustomerService,
    private readonly sessionService: LeadConversationSessionService,
    private readonly messageLog: LeadConversationMessageLogService,
    private readonly stateMachine: LeadConversationStateMachineService,
    private readonly reminderScheduler: LeadReminderScheduler,
    private readonly qualification: LeadQualificationService,
    private readonly dispatcher: LeadMessageDispatcherService,
    private readonly metaLeadFormQualificationScheduler: MetaLeadFormQualificationScheduler,
  ) {}

  async executeProcessIngress(payload: unknown): Promise<void> {
    for (const message of parseMetaLeadMessages(payload)) {
      await this.executeProcessMessage(message);
    }
  }

  private async executeProcessMessage(message: InboundLeadMessage): Promise<void> {
    const actorUserId = this.configService.get<string>('leadConversation.actorUserId', 'lead-conversation-bot');
    const customer = await this.leadCustomer.findOrCreateByWaId(message.waId, message.profileName, actorUserId);
    const session = await this.sessionService.findOrCreate({
      customerId: customer._id,
      waId: message.waId,
      phoneNumberId: message.phoneNumberId,
      profileName: message.profileName,
    });
    const isNew = await this.messageLog.saveInboundIfNew({ sessionId: session._id, customerId: customer._id, message });
    if (!isNew) {
      this.logger.debug(`Duplicate lead message ${message.wamid} ignored`);
      return;
    }
    await this.reminderScheduler.executeCancel(String(session._id));
    await this.metaLeadFormQualificationScheduler.executeCancelByWaId(message.waId);
    const applied = await this.executeApplyTransition(session, message);
    if (!applied) return;
    await this.executeSideEffects(applied, actorUserId);
  }

  /** Retries on optimistic-lock conflicts with a fresh session snapshot. */
  private async executeApplyTransition(
    initialSession: LeadSessionSnapshot,
    message: InboundLeadMessage,
  ): Promise<AppliedTransition | null> {
    let session: LeadSessionSnapshot | null = initialSession;
    for (let attempt = 0; attempt < MAX_TRANSITION_ATTEMPTS && session; attempt += 1) {
      const transition = await this.stateMachine.executeTransition(session, message);
      const updated = await this.sessionService.applyTransition(session, transition, message.timestamp);
      if (updated) return { session: updated, transition };
      session = await this.sessionService.findById(String(initialSession._id));
    }
    this.logger.warn(`Lead session ${String(initialSession._id)} transition conflict; message ${message.wamid} dropped`);
    return null;
  }

  private async executeSideEffects({ session, transition }: AppliedTransition, actorUserId: string): Promise<void> {
    if (transition.sessionPatch?.projectId) {
      await this.leadCustomer.addInterestedProject(session.customerId, transition.sessionPatch.projectId, actorUserId);
    }
    if (transition.shouldQualify) {
      await this.qualification
        .executeQualify(session)
        .catch((err: unknown) => this.logger.error(`Lead qualification failed: ${String(err)}`));
    }
    if (transition.outbound.length === 0) {
      await this.executeRearmReminder(session);
      return;
    }
    await this.dispatcher.executeDispatch({
      sessionId: String(session._id),
      customerId: String(session.customerId),
      to: session.waId,
      messages: transition.outbound,
      questionAt: transition.expectsReply ? session.lastQuestionAt : undefined,
    });
  }

  /** Silent turn (e.g. retries exhausted): keep the pending question's reminder alive. */
  private async executeRearmReminder(session: LeadSessionSnapshot): Promise<void> {
    if (session.status !== 'active' || session.reminderSentAt || !session.lastQuestionAt) return;
    await this.reminderScheduler.executeSchedule(String(session._id), session.lastQuestionAt.toISOString());
  }
}
