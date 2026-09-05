import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type {
  MarketingCampaignMsEvent,
  MarketingCampaignSendResponse,
} from '../whatsapp-marketing/types/marketing-campaign-ms-event.type';

/**
 * Sends webinar registration templates on the customers WABA via whatsapp_cloud_ms.
 */
@Injectable()
export class WebinarOutboundService {
  private readonly logger = new Logger(WebinarOutboundService.name);

  constructor(
    @Inject('WS_MS_QUEUE') private readonly wsMsClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

  async executeSendRegistrationTemplate(
    event: MarketingCampaignMsEvent,
  ): Promise<MarketingCampaignSendResponse> {
    const rabbitUrl: string = this.configService.get<string>('rabbitmq.url', '') ?? '';
    if (rabbitUrl.trim() === '') {
      this.logger.warn('webinar template outbound skipped: rabbitmq.url empty');
      return { success: false, message: 'rabbitmq.url empty' };
    }
    const payload = event.payload;
    this.logger.log(
      `webinar template RMQ emit marketing_campaign.ms_ws action=${payload.action} template=${payload.templateName} lang=${payload.languageCode} to=${payload.to} recipientId=${payload.campaignRecipientId}`,
    );
    try {
      const response = await lastValueFrom(
        this.wsMsClient.send<MarketingCampaignSendResponse>('marketing_campaign.ms_ws', event),
      );
      const result = response ?? { success: false, message: 'empty response' };
      this.logger.log(
        `webinar template RMQ response success=${result.success} messageId=${result.messageId ?? ''} message=${result.message ?? ''}`,
      );
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`webinar marketing_campaign.ms_ws failed: ${message}`);
      return { success: false, message };
    }
  }
}
