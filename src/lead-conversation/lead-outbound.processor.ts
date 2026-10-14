import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { LEAD_OUTBOUND_QUEUE } from './constants/lead-conversation.constants';
import { LeadConversationMessageLogService } from './lead-conversation-message-log.service';
import { LeadConversationSessionService } from './lead-conversation-session.service';
import { LeadMessageDispatcherService } from './lead-message-dispatcher.service';
import { LeadReminderScheduler } from './lead-reminder.scheduler';
import { LeadWhatsappSenderService } from './lead-whatsapp-sender.service';
import type { LeadOutboundJobData } from './types/lead-job-data.type';

/** Sends one message of a sequence, logs it, then chains the next message (or arms the reminder). */
@Processor(LEAD_OUTBOUND_QUEUE)
export class LeadOutboundProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadOutboundProcessor.name);

  constructor(
    private readonly sender: LeadWhatsappSenderService,
    private readonly messageLog: LeadConversationMessageLogService,
    private readonly dispatcher: LeadMessageDispatcherService,
    private readonly reminderScheduler: LeadReminderScheduler,
    private readonly sessionService: LeadConversationSessionService,
  ) {
    super();
  }

  async process(job: Job<LeadOutboundJobData>): Promise<void> {
    const { data } = job;
    const plan = data.messages[data.index];
    if (!plan) return;
    if (!(await this.sessionService.findById(data.sessionId))) {
      this.logger.log(`Lead session ${data.sessionId} no longer exists; dropping queued message ${data.index}`);
      return;
    }
    const result = await this.sender.executeSend(data.to, plan);
    if (!result.success) {
      this.logger.warn(`Lead message ${data.index} to ${data.to} not delivered: ${result.error ?? 'unknown'}`);
    }
    await this.messageLog.saveOutbound({
      sessionId: new Types.ObjectId(data.sessionId),
      customerId: new Types.ObjectId(data.customerId),
      plan,
      wamid: result.wamid,
      delivered: result.success,
    });
    await this.executeContinue(data);
  }

  private async executeContinue(data: LeadOutboundJobData): Promise<void> {
    const nextIndex = data.index + 1;
    if (nextIndex < data.messages.length) {
      await this.dispatcher.executeEnqueueStep({ ...data, index: nextIndex });
      return;
    }
    if (data.questionAt) {
      await this.reminderScheduler.executeSchedule(data.sessionId, data.questionAt);
    }
  }
}
