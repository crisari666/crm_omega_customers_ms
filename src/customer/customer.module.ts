import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
import { CustomerCallLogsService } from './customer-call-logs.service';
import { VoiceCallRmqController } from './voice-call-rmq.controller';
import { VoiceRmqTopologyService } from './voice-rmq-topology.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerDescription.name, schema: CustomerDescriptionSchema },
      { name: CustomerChangeLog.name, schema: CustomerChangeLogSchema },
      { name: CustomerStepUpdateLog.name, schema: CustomerStepUpdateLogSchema },
      { name: CustomerStep.name, schema: CustomerStepSchema },
      { name: CustomerCallLog.name, schema: CustomerCallLogSchema },
    ]),
  ],
  controllers: [CustomerController, CustomerAdminController, VoiceCallRmqController],
  providers: [
    CustomerService,
    CustomerAuditService,
    CustomerCallLogsService,
    VoiceRmqTopologyService,
  ],
  exports: [CustomerService, VoiceRmqTopologyService],
})
export class CustomerModule implements OnModuleInit {
  constructor(private readonly customerAuditService: CustomerAuditService) {}

  onModuleInit(): void {
    this.customerAuditService.attachCustomerSchemaHooks();
  }
}
