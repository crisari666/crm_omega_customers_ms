import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { LEAD_REMINDER_JOB, LEAD_REMINDER_QUEUE } from './constants/lead-conversation.constants';
import type { LeadReminderJobData } from './types/lead-job-data.type';

const DEFAULT_REMINDER_MS = 3600000;

const buildReminderJobId = (sessionId: string): string => `reminder-${sessionId}`;

/** Arms / cancels the single delayed "no reply" reminder job of a session. */
@Injectable()
export class LeadReminderScheduler {
  private readonly logger = new Logger(LeadReminderScheduler.name);

  constructor(
    @InjectQueue(LEAD_REMINDER_QUEUE) private readonly reminderQueue: Queue<LeadReminderJobData>,
    private readonly configService: ConfigService,
  ) {}

  async executeSchedule(sessionId: string, questionAt: string): Promise<void> {
    await this.executeCancel(sessionId);
    await this.reminderQueue.add(
      LEAD_REMINDER_JOB,
      { sessionId, questionAt },
      {
        jobId: buildReminderJobId(sessionId),
        delay: this.configService.get<number>('leadConversation.reminderMs', DEFAULT_REMINDER_MS),
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /** Best effort: the processor re-checks the session, so a missed cancel is harmless. */
  async executeCancel(sessionId: string): Promise<void> {
    try {
      await this.reminderQueue.remove(buildReminderJobId(sessionId));
    } catch (err) {
      this.logger.debug(`Reminder cancel skipped for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
