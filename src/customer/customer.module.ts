import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CustomerConversationsModule } from '../customer-conversations/customer-conversations.module';
import { CustomerAdminController } from './customer-admin.controller';
import { CustomerAuditService } from './customer-audit.service';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import {
  CustomerChangeLog,
  CustomerChangeLogSchema,
} from './schemas/customer-change-log.schema';
import {
  CustomerStepUpdateLog,
  CustomerStepUpdateLogSchema,
} from './schemas/customer-step-update-log.schema';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import {
  CustomerStep,
  CustomerStepSchema,
} from '../customer-steps/schemas/customer-step.schema';
import {
  CustomerDescription,
  CustomerDescriptionSchema,
} from './schemas/descriptions.schema';
import {
  CustomerCallLog,
  CustomerCallLogSchema,
} from './schemas/customer-call-log.schema';
import {
  CustomerEvent,
  CustomerEventSchema,
} from './schemas/customer-event.schema';
import { CustomerCallLogsService } from './customer-call-logs.service';
import {
  VentorScheduleEvent,
  VentorScheduleEventSchema,
} from '../ventor-schedule/schemas/ventor-schedule-event.schema';
import { VoiceCallRmqController } from './voice-call-rmq.controller';
import { VoiceRmqTopologyService } from './voice-rmq-topology.service';
import { CustomerWhatsappRmqController } from './customer-whatsapp-rmq.controller';
import { CustomerWhatsappEventsPublisher } from './customer-whatsapp-events.publisher';
import { CustomerEventsService } from './customer-events.service';
import { CustomerAutocompleteService } from './customer-autocomplete.service';
import { CustomerStaffPerformanceService } from './customer-staff-performance.service';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import { CustomerMetaLeadgenRmqController } from './customer-meta-leadgen-rmq.controller';
import { CustomerMetaLeadgenService } from './customer-meta-leadgen.service';
import { CustomerMetaWebhookRmqController } from './customer-meta-webhook-rmq.controller';
import { CustomerMetaWebhookService } from './customer-meta-webhook.service';
import {
  MetaLeadCampaign,
  MetaLeadCampaignSchema,
} from './schemas/meta-lead-campaign.schema';
import { CustomerPotentialCustomersOutboundService } from './customer-potential-customers-outbound.service';
import { CustomerWhatsappFlowCompletedRmqController } from './customer-whatsapp-flow-completed-rmq.controller';
import { CustomerVentorAssignmentService } from './customer-ventor-assignment.service';
import { CustomerWhatsappFlowCompletedService } from './customer-whatsapp-flow-completed.service';

@Module({
  imports: [
    CustomerConversationsModule,
    ClientsModule.registerAsync([
      {
        name: 'WHATSAPP_MS_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('rabbitmq.url', '')],
            queue: 'crm.whatsapp.events',
            queueOptions: { durable: true },
          },
        }),
        inject: [ConfigService],
      },
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
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerDescription.name, schema: CustomerDescriptionSchema },
      { name: CustomerChangeLog.name, schema: CustomerChangeLogSchema },
      { name: CustomerStepUpdateLog.name, schema: CustomerStepUpdateLogSchema },
      { name: CustomerStep.name, schema: CustomerStepSchema },
      { name: CustomerCallLog.name, schema: CustomerCallLogSchema },
      { name: CustomerEvent.name, schema: CustomerEventSchema },
      { name: VentorScheduleEvent.name, schema: VentorScheduleEventSchema },
      { name: MetaLeadCampaign.name, schema: MetaLeadCampaignSchema },
    ]),
  ],
  controllers: [
    CustomerController,
    CustomerAdminController,
    VoiceCallRmqController,
    CustomerWhatsappRmqController,
    CustomerMetaWebhookRmqController,
    CustomerMetaLeadgenRmqController,
    CustomerWhatsappFlowCompletedRmqController,
  ],
  providers: [
    ParseHexObjectIdPipe,
    CustomerService,
    CustomerAuditService,
    CustomerCallLogsService,
    CustomerEventsService,
    CustomerAutocompleteService,
    VoiceRmqTopologyService,
    CustomerWhatsappEventsPublisher,
    CustomerStaffPerformanceService,
    CustomerMetaWebhookService,
    CustomerMetaLeadgenService,
    CustomerVentorAssignmentService,
    CustomerPotentialCustomersOutboundService,
    CustomerWhatsappFlowCompletedService,
  ],
  exports: [CustomerService, VoiceRmqTopologyService, CustomerEventsService],
})
export class CustomerModule implements OnModuleInit {
  constructor(private readonly customerAuditService: CustomerAuditService) {}

  onModuleInit(): void {
    this.customerAuditService.attachCustomerSchemaHooks();
  }
}
