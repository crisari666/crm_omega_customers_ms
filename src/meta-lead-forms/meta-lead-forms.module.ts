import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MetaLeadCampaign,
  MetaLeadCampaignSchema,
} from '../customer/schemas/meta-lead-campaign.schema';
import { LEAD_WS_MS_CLIENT } from '../lead-conversation/constants/lead-conversation.constants';
import {
  LeadConversationSession,
  LeadConversationSessionSchema,
} from '../lead-conversation/schemas/lead-conversation-session.schema';
import { parseRedisUrl } from '../lead-conversation/utils/parse-redis-url.util';
import { META_LEAD_FORM_QUALIFICATION_QUEUE } from './constants/meta-lead-form.constants';
import { MetaLeadFormLookupService } from './meta-lead-form-lookup.service';
import { MetaLeadFormQualificationProcessor } from './meta-lead-form-qualification.processor';
import { MetaLeadFormQualificationScheduler } from './meta-lead-form-qualification.scheduler';
import { MetaLeadFormQualificationService } from './meta-lead-form-qualification.service';
import { MetaLeadFormsController } from './meta-lead-forms.controller';
import { MetaLeadFormsService } from './meta-lead-forms.service';
import {
  MetaLeadFormSettings,
  MetaLeadFormSettingsSchema,
} from './schemas/meta-lead-form-settings.schema';
import { MetaLeadForm, MetaLeadFormSchema } from './schemas/meta-lead-form.schema';

/**
 * Meta Lead Ads form registry: admin CRUD, settings, delayed qualification outbound.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MetaLeadForm.name, schema: MetaLeadFormSchema },
      { name: MetaLeadFormSettings.name, schema: MetaLeadFormSettingsSchema },
      { name: MetaLeadCampaign.name, schema: MetaLeadCampaignSchema },
      { name: LeadConversationSession.name, schema: LeadConversationSessionSchema },
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: parseRedisUrl(
          configService.get<string>('leadConversation.redisUrl', 'redis://localhost:6379'),
        ),
      }),
    }),
    BullModule.registerQueue({ name: META_LEAD_FORM_QUALIFICATION_QUEUE }),
    ClientsModule.registerAsync([
      {
        name: LEAD_WS_MS_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('rabbitmq.url', '')],
            queue: 'ws_ms_queue',
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  controllers: [MetaLeadFormsController],
  providers: [
    MetaLeadFormsService,
    MetaLeadFormLookupService,
    MetaLeadFormQualificationScheduler,
    MetaLeadFormQualificationService,
    MetaLeadFormQualificationProcessor,
  ],
  exports: [MetaLeadFormLookupService, MetaLeadFormQualificationScheduler],
})
export class MetaLeadFormsModule {}
