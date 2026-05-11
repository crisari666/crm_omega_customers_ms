import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CustomerPayment,
  CustomerPaymentSchema,
} from './schemas/customer-payment.schema';
import { CustomerPaymentController } from './customer-payment.controller';
import { CustomerPaymentService } from './customer-payment.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomerPayment.name, schema: CustomerPaymentSchema },
    ]),
  ],
  controllers: [CustomerPaymentController],
  providers: [CustomerPaymentService],
})
export class CustomerPaymentModule {}
