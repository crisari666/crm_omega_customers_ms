import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WebinarEventDocument = HydratedDocument<WebinarEvent>;

export enum WebinarEventStatus {
  Draft = 'draft',
  Active = 'active',
  Closed = 'closed',
}

/**
 * Customer-facing webinar / MasterClass event used for registration notifications.
 */
@Schema({ timestamps: true, collection: 'webinar_events' })
export class WebinarEvent {
  @Prop({ type: String, required: true })
  name: string;

  /** Template variable `day` — derived from scheduledAt (America/Bogota). */
  @Prop({ type: String, required: true })
  dayLabel: string;

  /** Template variable `date_webinar` — derived from scheduledAt (America/Bogota). */
  @Prop({ type: String, required: true })
  dateText: string;

  /** Template variable `time` — derived from scheduledAt (America/Bogota). */
  @Prop({ type: String, required: true })
  timeText: string;

  /** Google Meet join URL created by CRM Calendar sync. */
  @Prop({ type: String, required: false, default: '' })
  meetLink: string;

  /** Google Calendar event id for this webinar. */
  @Prop({ type: String, required: false, index: true })
  googleCalendarEventId?: string;

  @Prop({
    type: String,
    enum: WebinarEventStatus,
    default: WebinarEventStatus.Draft,
    index: true,
  })
  status: WebinarEventStatus;

  /** Absolute webinar start instant; template day/date/time use America/Bogota. */
  @Prop({ type: Date, required: true, index: true })
  scheduledAt: Date;
}

export const WebinarEventSchema = SchemaFactory.createForClass(WebinarEvent);

WebinarEventSchema.index({ status: 1, scheduledAt: -1 });
WebinarEventSchema.index({ createdAt: -1 });
