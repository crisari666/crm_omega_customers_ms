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
import { Customer, CustomerSchema } from './schemas/customer.schema';
import {
  CustomerDescription,
  CustomerDescriptionSchema,
} from './schemas/descriptions.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerDescription.name, schema: CustomerDescriptionSchema },
      { name: CustomerChangeLog.name, schema: CustomerChangeLogSchema },
    ]),
  ],
  controllers: [CustomerController, CustomerAdminController],
  providers: [CustomerService, CustomerAuditService],
  exports: [CustomerService],
})
export class CustomerModule implements OnModuleInit {
  constructor(private readonly customerAuditService: CustomerAuditService) {}

  onModuleInit(): void {
    this.customerAuditService.attachCustomerSchemaHooks();
  }
}
