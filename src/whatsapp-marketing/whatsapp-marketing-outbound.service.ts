import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type {
  MarketingCampaignMsEvent,
  MarketingCampaignSendResponse,
} from './types/marketing-campaign-ms-event.type';

@Injectable()
export class WhatsappMarketingOutboundService {
  private readonly logger = new Logger(WhatsappMarketingOutboundService.name);

  constructor(
    @Inject('WS_MS_QUEUE') private readonly wsMsClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

  async executeSendMarketingTemplate(
    event: MarketingCampaignMsEvent,
  ): Promise<MarketingCampaignSendResponse> {
    const rabbitUrl: string = this.configService.get<string>('rabbitmq.url', '') ?? '';
    if (rabbitUrl.trim() === '') {
      return { success: false, message: 'rabbitmq.url empty' };
    }
    try {
      const response = await lastValueFrom(
        this.wsMsClient.send<MarketingCampaignSendResponse>('marketing_campaign.ms_ws', event),
      );
      return response ?? { success: false, message: 'empty response' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`marketing_campaign.ms_ws failed: ${message}`);
      return { success: false, message };
    }
  }
}
