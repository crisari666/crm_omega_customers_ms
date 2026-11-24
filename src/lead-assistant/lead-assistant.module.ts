import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LEAD_AGENT_RECOVERY_QUEUE,
  LEAD_WS_MS_CLIENT,
} from '../lead-conversation/constants/lead-conversation.constants';
import { parseRedisUrl } from '../lead-conversation/utils/parse-redis-url.util';
import { MetaLeadForm, MetaLeadFormSchema } from '../meta-lead-forms/schemas/meta-lead-form.schema';
import { LeadAssistantSettingsService } from './lead-assistant-settings.service';
import { LeadFaqResolverService } from './lead-faq-resolver.service';
import { LeadFaqsService } from './lead-faqs.service';
import { LeadReadinessService } from './lead-readiness.service';
import { LeadRecoverySequenceService } from './lead-recovery-sequence.service';
import { LeadRecoveryScheduler } from './lead-recovery.scheduler';
import { LeadTemplateRendererService } from './lead-template-renderer.service';
import { LeadTemplatesService } from './lead-templates.service';
import { LeadUnansweredQuestionsService } from './lead-unanswered-questions.service';
import {
  LeadAssistantSettings,
  LeadAssistantSettingsSchema,
} from './schemas/lead-assistant-settings.schema';
import { LeadFaq, LeadFaqSchema } from './schemas/lead-faq.schema';
import {
  LeadRecoverySequence,
  LeadRecoverySequenceSchema,
} from './schemas/lead-recovery-sequence.schema';
import {
  LeadUnansweredQuestion,
  LeadUnansweredQuestionSchema,
} from './schemas/lead-unanswered-question.schema';

/**
 * Lead Scoring V2 assistant configuration: settings, FAQs, unanswered questions,
 * recovery sequence, approved templates and readiness checklist.
 * HTTP controllers live on CustomerModule (before `:customerId`) so
 * `GET admin/customer/lead-assistant/...` is not captured as a customer id.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeadAssistantSettings.name, schema: LeadAssistantSettingsSchema },
      { name: LeadFaq.name, schema: LeadFaqSchema },
      { name: LeadUnansweredQuestion.name, schema: LeadUnansweredQuestionSchema },
      { name: LeadRecoverySequence.name, schema: LeadRecoverySequenceSchema },
      { name: MetaLeadForm.name, schema: MetaLeadFormSchema },
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
    BullModule.registerQueue({ name: LEAD_AGENT_RECOVERY_QUEUE }),
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
  providers: [
    LeadAssistantSettingsService,
    LeadFaqsService,
    LeadFaqResolverService,
    LeadUnansweredQuestionsService,
    LeadRecoverySequenceService,
    LeadRecoveryScheduler,
    LeadTemplateRendererService,
    LeadTemplatesService,
    LeadReadinessService,
  ],
  exports: [
    LeadAssistantSettingsService,
    LeadFaqsService,
    LeadFaqResolverService,
    LeadUnansweredQuestionsService,
    LeadRecoverySequenceService,
    LeadRecoveryScheduler,
    LeadTemplateRendererService,
    LeadTemplatesService,
    LeadReadinessService,
  ],
})
export class LeadAssistantModule {}
