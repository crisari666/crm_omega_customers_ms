import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LEAD_REMINDER_QUEUE } from './constants/lead-conversation.constants';
import { LeadConversationSessionService } from './lead-conversation-session.service';
import { LeadMessageComposerService } from './lead-message-composer.service';
import { LeadMessageDispatcherService } from './lead-message-dispatcher.service';
import type { LeadReminderJobData } from './types/lead-job-data.type';

/** Fires after 1h of silence: asks "¿Quieres agendar llamada?" (Sí / No) once per session. */
@Processor(LEAD_REMINDER_QUEUE)
export class LeadReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadReminderProcessor.name);

  constructor(
    private readonly sessionService: LeadConversationSessionService,
    private readonly composer: LeadMessageComposerService,
    private readonly dispatcher: LeadMessageDispatcherService,
  ) {
    super();
  }

  async process(job: Job<LeadReminderJobData>): Promise<void> {
    const reminder = this.composer.composeReminder();
    const session = await this.sessionService.markReminderSent(job.data.sessionId, new Date(job.data.questionAt), reminder);
    if (!session) {
      this.logger.debug(`Reminder skipped for session ${job.data.sessionId} (answered or already reminded)`);
      return;
    }
    await this.dispatcher.executeDispatch({
      sessionId: String(session._id),
      customerId: String(session.customerId),
      to: session.waId,
      messages: reminder,
    });
  }
}
