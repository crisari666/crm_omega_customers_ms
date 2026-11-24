import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MongooseModule } from '@nestjs/mongoose';
import { LeadAssistantModule } from '../lead-assistant/lead-assistant.module';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import { CustomerMetadataModule } from '../customer-metadata/customer-metadata.module';
import { CustomerModule } from '../customer/customer.module';
import { Customer, CustomerSchema } from '../customer/schemas/customer.schema';
import {
  MetaLeadCampaign,
  MetaLeadCampaignSchema,
} from '../customer/schemas/meta-lead-campaign.schema';
import { MetaLeadFormsModule } from '../meta-lead-forms/meta-lead-forms.module';
import {
  LEAD_AGENT_RECOVERY_QUEUE,
  LEAD_AGENT_TURN_QUEUE,
  LEAD_OUTBOUND_QUEUE,
  LEAD_REMINDER_QUEUE,
  LEAD_WS_MS_CLIENT,
} from './constants/lead-conversation.constants';
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
import { LeadAdProjectResolverService } from './lead-ad-project-resolver.service';
import { ReminderReplyHandler } from './handlers/reminder-reply.handler';
import { TerminalHandler } from './handlers/terminal.handler';
import { LeadCallScheduleAdminController } from './lead-call-schedule-admin.controller';
import { LeadCallScheduleAdminService } from './lead-call-schedule-admin.service';
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
import { LeadAgentEngineService } from './v2/lead-agent-engine.service';
import { LeadAgentGuidedPathService } from './v2/lead-agent-guided-path.service';
import { LeadAgentInboundService } from './v2/lead-agent-inbound.service';
import { LeadAgentLlmService } from './v2/lead-agent-llm.service';
import { LeadAgentPromptBuilder } from './v2/lead-agent-prompt.builder';
import { LeadCaptureSyncService } from './v2/lead-capture-sync.service';
import { LeadAgentRecoveryProcessor } from './v2/lead-agent-recovery.processor';
import { LeadAgentScoringService } from './v2/lead-agent-scoring.service';
import { LeadAgentSideEffectsService } from './v2/lead-agent-side-effects.service';
import { LeadAgentSimulatorController } from './v2/lead-agent-simulator.controller';
import { LeadAgentSimulatorService } from './v2/lead-agent-simulator.service';
import { LeadAgentSlotBridgeService } from './v2/lead-agent-slot-bridge.service';
import { LeadAgentStageService } from './v2/lead-agent-stage.service';
import { LeadAgentTurnProcessor } from './v2/lead-agent-turn.processor';
import { LeadFlowResolverService } from './v2/lead-flow-resolver.service';
import { ProjectKnowledgeService } from './v2/project-knowledge.service';

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
    LeadAssistantModule,
    forwardRef(() => MetaLeadFormsModule),
    MongooseModule.forFeature([
      { name: LeadConversationSession.name, schema: LeadConversationSessionSchema },
      { name: LeadConversationMessage.name, schema: LeadConversationMessageSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: MetaLeadCampaign.name, schema: MetaLeadCampaignSchema },
      { name: VentorScheduleEvent.name, schema: VentorScheduleEventSchema },
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: parseRedisUrl(configService.get<string>('leadConversation.redisUrl', 'redis://localhost:6379')),
      }),
    }),
    BullModule.registerQueue(
      { name: LEAD_OUTBOUND_QUEUE },
      { name: LEAD_REMINDER_QUEUE },
      { name: LEAD_AGENT_TURN_QUEUE },
      { name: LEAD_AGENT_RECOVERY_QUEUE },
    ),
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
    LeadCallScheduleAdminController,
    LeadConversationInboundRmqController,
    LeadAgentSimulatorController,
  ],
  providers: [
    ParseHexObjectIdPipe,
    LeadConversationAdminService,
    LeadCallScheduleAdminService,
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
    LeadAdProjectResolverService,
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
    ProjectKnowledgeService,
    LeadAgentScoringService,
    LeadAgentStageService,
    LeadAgentLlmService,
    LeadAgentPromptBuilder,
    LeadCaptureSyncService,
    LeadAgentGuidedPathService,
    LeadAgentEngineService,
    LeadAgentSimulatorService,
    LeadFlowResolverService,
    LeadAgentInboundService,
    LeadAgentSlotBridgeService,
    LeadAgentSideEffectsService,
    LeadAgentTurnProcessor,
    LeadAgentRecoveryProcessor,
  ],
})
export class LeadConversationModule {}
