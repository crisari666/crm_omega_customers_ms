import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VentorScheduleService } from './ventor-schedule.service';

@Injectable()
export class VentorMeetSubscriptionCronService {
  private readonly logger = new Logger(VentorMeetSubscriptionCronService.name);

  constructor(
    private readonly ventorScheduleService: VentorScheduleService,
  ) {}

  /** Hourly: subscribe pending Meet spaces scheduled within the next 24h. */
  @Cron(CronExpression.EVERY_HOUR)
  async handleSubscribePendingMeetSpaces(): Promise<void> {
    try {
      const count =
        await this.ventorScheduleService.executeSubscribePendingMeetSpaces();
      if (count > 0) {
        this.logger.log(`Subscribed ${count} pending Meet space(s)`);
      }
    } catch (err: unknown) {
      this.logger.error(
        `Meet subscription cron failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
