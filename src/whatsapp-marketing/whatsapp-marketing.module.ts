import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Customer, CustomerSchema } from '../customer/schemas/customer.schema';
import { CustomerModule } from '../customer/customer.module';
import { CustomerConversationsModule } from '../customer-conversations/customer-conversations.module';
import {
  CustomerStep,
  CustomerStepSchema,
} from '../customer-steps/schemas/customer-step.schema';
import {
  WhatsappMarketingCampaign,
  WhatsappMarketingCampaignSchema,
} from './schemas/whatsapp-marketing-campaign.schema';
import {
  WhatsappMarketingCampaignRecipient,
  WhatsappMarketingCampaignRecipientSchema,
} from './schemas/whatsapp-marketing-campaign-recipient.schema';
import { WhatsappMarketingController } from './whatsapp-marketing.controller';
import { WhatsappMarketingRmqController } from './whatsapp-marketing-rmq.controller';
import { WhatsappMarketingCampaignService } from './whatsapp-marketing-campaign.service';
import { WhatsappMarketingAudienceService } from './whatsapp-marketing-audience.service';
import { WhatsappMarketingOutboundService } from './whatsapp-marketing-outbound.service';
import { WhatsappMarketingDispatchService } from './whatsapp-marketing-dispatch.service';
import { WhatsappMarketingStatusService } from './whatsapp-marketing-status.service';
import { WhatsappMarketingRecoveryReplyService } from './whatsapp-marketing-recovery-reply.service';

@Module({
  imports: [
    CustomerConversationsModule,
    forwardRef(() => CustomerModule),
    MongooseModule.forFeature([
      { name: WhatsappMarketingCampaign.name, schema: WhatsappMarketingCampaignSchema },
      {
        name: WhatsappMarketingCampaignRecipient.name,
        schema: WhatsappMarketingCampaignRecipientSchema,
      },
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerStep.name, schema: CustomerStepSchema },
    ]),
    ClientsModule.registerAsync([
      {
        name: 'WS_MS_QUEUE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('rabbitmq.url', '')],
            queue: 'ws_ms_queue',
            queueOptions: { durable: true },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [WhatsappMarketingController, WhatsappMarketingRmqController],
  providers: [
    WhatsappMarketingCampaignService,
    WhatsappMarketingAudienceService,
    WhatsappMarketingOutboundService,
    WhatsappMarketingDispatchService,
    WhatsappMarketingStatusService,
    WhatsappMarketingRecoveryReplyService,
  ],
  exports: [WhatsappMarketingRecoveryReplyService, WhatsappMarketingStatusService],
})
export class WhatsappMarketingModule {}
