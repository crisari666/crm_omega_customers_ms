import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MongooseModule } from '@nestjs/mongoose';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import { CustomerMetadataModule } from '../customer-metadata/customer-metadata.module';
import { CustomerModule } from '../customer/customer.module';
import { Customer, CustomerSchema } from '../customer/schemas/customer.schema';
import { LEAD_OUTBOUND_QUEUE, LEAD_REMINDER_QUEUE, LEAD_WS_MS_CLIENT } from './constants/lead-conversation.constants';
import {
  VentorScheduleEvent,
  VentorScheduleEventSchema,
} from '../ventor-schedule/schemas/ventor-schedule-event.schema';
import { AskCallSlotHandler } from './handlers/ask-call-slot.handler';
import { AskLotRangeHandler } from './handlers/ask-lot-range.handler';
import { AskPaymentHandler } from './handlers/ask-payment.handler';
import { AskProjectHandler } from './handlers/ask-project.handler';
import { AskScheduleHandler } from './handlers/ask-schedule.handler';
import { InitialHandler } from './handlers/initial.handler';
import { ReminderReplyHandler } from './handlers/reminder-reply.handler';
import { TerminalHandler } from './handlers/terminal.handler';
import { LeadCallSlotService } from './lead-call-slot.service';
import { LeadConversationAdminController } from './lead-conversation-admin.controller';
import { LeadConversationAdminService } from './lead-conversation-admin.service';
import { LeadConversationInboundRmqController } from './lead-conversation-inbound.rmq.controller';
import { LeadConversationInboundService } from './lead-conversation-inbound.service';
import { LeadConversationMessageLogService } from './lead-conversation-message-log.service';
import { LeadConversationQueryService } from './lead-conversation-query.service';
import { LeadConversationSessionService } from './lead-conversation-session.service';
import { LeadConversationStateMachineService } from './lead-conversation-state-machine.service';
import { LeadConversationController } from './lead-conversation.controller';
import { LeadCustomerService } from './lead-customer.service';
import { LeadFlowTransitionsService } from './lead-flow-transitions.service';
import { LeadMessageComposerService } from './lead-message-composer.service';
import { LeadMessageDispatcherService } from './lead-message-dispatcher.service';
import { LeadOutboundProcessor } from './lead-outbound.processor';
import { LeadQualificationService } from './lead-qualification.service';
import { LeadReminderProcessor } from './lead-reminder.processor';
import { LeadReminderScheduler } from './lead-reminder.scheduler';
import { LeadScoringService } from './lead-scoring.service';
import { LeadWhatsappSenderService } from './lead-whatsapp-sender.service';
import { ProjectCatalogService } from './project-catalog.service';
import { ProjectClassifierLlmService } from './project-classifier-llm.service';
import { ProjectMatcherService } from './project-matcher.service';
import {
  LeadConversationMessage,
  LeadConversationMessageSchema,
} from './schemas/lead-conversation-message.schema';
import {
  LeadConversationSession,
  LeadConversationSessionSchema,
} from './schemas/lead-conversation-session.schema';
import { LEAD_STEP_HANDLERS, type LeadStepHandler } from './types/lead-step-handler.interface';
import { parseRedisUrl } from './utils/parse-redis-url.util';

const STEP_HANDLERS = [
  InitialHandler,
  AskProjectHandler,
  AskLotRangeHandler,
  AskPaymentHandler,
  AskScheduleHandler,
  AskCallSlotHandler,
  ReminderReplyHandler,
  TerminalHandler,
] as const;

/**
 * AI lead qualification over WhatsApp (`lead_conversation` webhook line):
 * project detection, lot range, payment method, call scheduling, score and ventor assignment.
 */
@Module({
  imports: [
    CustomerModule,
    CustomerMetadataModule,
    MongooseModule.forFeature([
      { name: LeadConversationSession.name, schema: LeadConversationSessionSchema },
      { name: LeadConversationMessage.name, schema: LeadConversationMessageSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: VentorScheduleEvent.name, schema: VentorScheduleEventSchema },
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: parseRedisUrl(configService.get<string>('leadConversation.redisUrl', 'redis://localhost:6379')),
      }),
    }),
    BullModule.registerQueue({ name: LEAD_OUTBOUND_QUEUE }, { name: LEAD_REMINDER_QUEUE }),
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
  controllers: [
    LeadConversationController,
    LeadConversationAdminController,
    LeadConversationInboundRmqController,
  ],
  providers: [
    ParseHexObjectIdPipe,
    LeadConversationAdminService,
    ...STEP_HANDLERS,
    {
      provide: LEAD_STEP_HANDLERS,
      inject: [...STEP_HANDLERS],
      useFactory: (...handlers: LeadStepHandler[]): LeadStepHandler[] => handlers,
    },
    LeadConversationInboundService,
    LeadConversationStateMachineService,
    LeadConversationSessionService,
    LeadConversationMessageLogService,
    LeadConversationQueryService,
    LeadCallSlotService,
    LeadCustomerService,
    LeadFlowTransitionsService,
    LeadMessageComposerService,
    LeadMessageDispatcherService,
    LeadOutboundProcessor,
    LeadReminderProcessor,
    LeadReminderScheduler,
    LeadScoringService,
    LeadQualificationService,
    LeadWhatsappSenderService,
    ProjectCatalogService,
    ProjectClassifierLlmService,
    ProjectMatcherService,
  ],
})
export class LeadConversationModule {}
