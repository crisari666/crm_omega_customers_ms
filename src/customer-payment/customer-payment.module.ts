import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerModule } from '../customer/customer.module';
import {
  Customer,
  CustomerSchema,
} from '../customer/schemas/customer.schema';
import {
  VentorScheduleEvent,
  VentorScheduleEventSchema,
} from '../ventor-schedule/schemas/ventor-schedule-event.schema';
import { CustomerDownPaymentController } from './customer-down-payment.controller';
import { CustomerDownPaymentService } from './customer-down-payment.service';
import { CustomerPaymentAccessService } from './customer-payment-access.service';
import { CustomerPaymentController } from './customer-payment.controller';
import { CustomerPaymentService } from './customer-payment.service';
import {
  CustomerDownPayment,
  CustomerDownPaymentSchema,
} from './schemas/customer-down-payment.schema';
import {
  CustomerPayment,
  CustomerPaymentSchema,
} from './schemas/customer-payment.schema';
import {
  CustomerPaymentFee,
  CustomerPaymentFeeSchema,
} from './schemas/customer-payment-fee.schema';

@Module({
  imports: [
    CustomerModule,
    MongooseModule.forFeature([
      { name: CustomerPayment.name, schema: CustomerPaymentSchema },
      { name: CustomerDownPayment.name, schema: CustomerDownPaymentSchema },
      { name: CustomerPaymentFee.name, schema: CustomerPaymentFeeSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: VentorScheduleEvent.name, schema: VentorScheduleEventSchema },
    ]),
  ],
  controllers: [CustomerPaymentController, CustomerDownPaymentController],
  providers: [
    CustomerPaymentService,
    CustomerDownPaymentService,
    CustomerPaymentAccessService,
  ],
})
export class CustomerPaymentModule {}
