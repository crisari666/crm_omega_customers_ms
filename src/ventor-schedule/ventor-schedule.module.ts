import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerModule } from '../customer/customer.module';
import { Customer, CustomerSchema } from '../customer/schemas/customer.schema';
import {
  VentorScheduleEvent,
  VentorScheduleEventSchema,
} from './schemas/ventor-schedule-event.schema';
import { VentorScheduleController } from './ventor-schedule.controller';
import { VentorScheduleService } from './ventor-schedule.service';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';

@Module({
  imports: [
    CustomerModule,
    MongooseModule.forFeature([
      { name: VentorScheduleEvent.name, schema: VentorScheduleEventSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [VentorScheduleController],
  providers: [VentorScheduleService, ParseHexObjectIdPipe],
})
export class VentorScheduleModule {}
