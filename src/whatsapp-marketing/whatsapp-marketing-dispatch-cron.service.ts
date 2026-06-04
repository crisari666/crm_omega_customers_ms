import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WhatsappMarketingDispatchService } from './whatsapp-marketing-dispatch.service';

/**
 * Polls sending campaigns and dispatches the next batch when {@link WhatsappMarketingCampaign.nextBatchAt} is due.
 */
@Injectable()
export class WhatsappMarketingDispatchCronService {
  private readonly logger = new Logger(WhatsappMarketingDispatchCronService.name);

  constructor(private readonly dispatchService: WhatsappMarketingDispatchService) {}

  @Cron('*/5 * * * * *')
  async executeDispatchDueCampaignBatches(): Promise<void> {
    try {
      await this.dispatchService.executeTickAllSendingCampaigns();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Marketing dispatch cron failed: ${message}`);
    }
  }
}
