import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerStepsController } from './customer-steps.controller';
import { CustomerStepsService } from './customer-steps.service';
import {
  CustomerStep,
  CustomerStepSchema,
} from './schemas/customer-step.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomerStep.name, schema: CustomerStepSchema },
    ]),
  ],
  controllers: [CustomerStepsController],
  providers: [CustomerStepsService],
})
export class CustomerStepsModule {}
