import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';

@Module({
  imports: [
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
    ]),
  ],
  controllers: [
    CustomerController,
    CustomerAdminController,
    VoiceCallRmqController,
    CustomerWhatsappRmqController,
  ],
  providers: [
    ParseHexObjectIdPipe,
    CustomerService,
    CustomerAuditService,
    CustomerCallLogsService,
    CustomerEventsService,
    VoiceRmqTopologyService,
    CustomerWhatsappEventsPublisher,
  ],
  exports: [CustomerService, VoiceRmqTopologyService, CustomerEventsService],
})
export class CustomerModule implements OnModuleInit {
  constructor(private readonly customerAuditService: CustomerAuditService) {}

  onModuleInit(): void {
    this.customerAuditService.attachCustomerSchemaHooks();
  }
}
