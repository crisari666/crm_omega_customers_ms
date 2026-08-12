import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VentorScheduleEventDocument =
  HydratedDocument<VentorScheduleEvent>;

export enum VentorScheduleEventType {
  Virtual = 'virtual',
  Office = 'office',
  OnLand = 'on_land',
  Call = 'call',
}

export enum VentorScheduleEventStatus {
  Pending = 'pending',
  Done = 'done',
  Cancelled = 'cancelled',
}

@Schema({ timestamps: true })
export class VentorScheduleEvent {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true, index: true })
  scheduledAt: Date;

  @Prop({
    type: String,
    enum: VentorScheduleEventType,
    required: true,
  })
  eventType: VentorScheduleEventType;

  @Prop()
  note?: string;

  @Prop()
  googleMeetUrl?: string;

  @Prop()
  googleCalendarEventId?: string;

  /** Office user id of the agent attending the on-land visit (nullable until assigned). */
  @Prop({ index: true })
  onLandAgentUserId?: string;

  @Prop({
    type: String,
    enum: VentorScheduleEventStatus,
    required: true,
    default: VentorScheduleEventStatus.Pending,
  })
  status: VentorScheduleEventStatus;
}

export const VentorScheduleEventSchema = SchemaFactory.createForClass(
  VentorScheduleEvent,
);

VentorScheduleEventSchema.index({ userId: 1, scheduledAt: 1 });
VentorScheduleEventSchema.index({ eventType: 1, scheduledAt: 1 });
VentorScheduleEventSchema.index({ onLandAgentUserId: 1, scheduledAt: 1 });
