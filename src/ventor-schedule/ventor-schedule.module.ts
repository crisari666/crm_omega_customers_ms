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
import { VentorMeetGoogleCalendarService } from './ventor-meet-google-calendar.service';
import { VentorMeetWorkspaceEventsService } from './ventor-meet-workspace-events.service';
import { VentorMeetSubscriptionCronService } from './ventor-meet-subscription-cron.service';
import { VentorMeetArtifactsWebhookController } from './ventor-meet-artifacts-webhook.controller';

/**
 * Cron providers for Meet subscriptions. ScheduleModule.forRoot is registered in AppModule.
 */
@Module({
  imports: [
    CustomerModule,
    MongooseModule.forFeature([
      { name: VentorScheduleEvent.name, schema: VentorScheduleEventSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [
    VentorScheduleController,
    VentorMeetArtifactsWebhookController,
  ],
  providers: [
    VentorScheduleService,
    ParseHexObjectIdPipe,
    VentorMeetGoogleCalendarService,
    VentorMeetWorkspaceEventsService,
    VentorMeetSubscriptionCronService,
  ],
})
export class VentorScheduleModule {}
