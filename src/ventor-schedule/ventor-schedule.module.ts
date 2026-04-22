import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customer/schemas/customer.schema';
import {
  VentorScheduleEvent,
  VentorScheduleEventSchema,
} from './schemas/ventor-schedule-event.schema';
import { VentorScheduleController } from './ventor-schedule.controller';
import { VentorScheduleService } from './ventor-schedule.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VentorScheduleEvent.name, schema: VentorScheduleEventSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [VentorScheduleController],
  providers: [VentorScheduleService],
})
export class VentorScheduleModule {}
