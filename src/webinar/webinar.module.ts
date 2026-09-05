import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerModule } from '../customer/customer.module';
import { Customer, CustomerSchema } from '../customer/schemas/customer.schema';
import { WebinarEvent, WebinarEventSchema } from './schemas/webinar-event.schema';
import { WebinarLead, WebinarLeadSchema } from './schemas/webinar-lead.schema';
import { WebinarEventsController } from './webinar-events.controller';
import { WebinarEventsService } from './webinar-events.service';
import { WebinarIngestService } from './webinar-ingest.service';
import { WebinarLeadsController } from './webinar-leads.controller';
import { WebinarLeadsService } from './webinar-leads.service';
import { WebinarOutboundService } from './webinar-outbound.service';
import { WebinarRmqController } from './webinar-rmq.controller';
import { WebinarGoogleCalendarService } from './webinar-google-calendar.service';

@Module({
  imports: [
    CustomerModule,
    MongooseModule.forFeature([
      { name: WebinarEvent.name, schema: WebinarEventSchema },
      { name: WebinarLead.name, schema: WebinarLeadSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    ClientsModule.registerAsync([
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
  ],
  controllers: [WebinarEventsController, WebinarLeadsController, WebinarRmqController],
  providers: [
    WebinarEventsService,
    WebinarLeadsService,
    WebinarIngestService,
    WebinarOutboundService,
    WebinarGoogleCalendarService,
  ],
})
export class WebinarModule {}
