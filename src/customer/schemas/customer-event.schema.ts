import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Customer } from './customer.schema';

export const CUSTOMER_EVENT_TYPES = [
  'WHATSAPP_CALL',
  'WHATSAPP_MESSAGE',
  'PHONE_CALL',
  'VIDEO_CALL',
  'CALL_CRM',
] as const;

export type CustomerEventType = (typeof CUSTOMER_EVENT_TYPES)[number];
export type CustomerEventDocument = HydratedDocument<CustomerEvent>;

@Schema({ collection: 'customer_events', timestamps: true })
export class CustomerEvent {
  @Prop({
    required: true,
    enum: CUSTOMER_EVENT_TYPES,
    index: true,
  })
  eventType: CustomerEventType;

  @Prop({ required: true })
  description: string;

  @Prop({ required: false, min: 0, max: 100, index: true })
  score?: number;

  @Prop({ type: Types.ObjectId, ref: Customer.name, required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: false, index: true })
  officeId?: string;

  @Prop({ type: Object, required: false })
  metadata?: Record<string, unknown>;
}

export const CustomerEventSchema = SchemaFactory.createForClass(CustomerEvent);

CustomerEventSchema.index(
  { customerId: 1, createdAt: -1 },
  { name: 'customerId_createdAt_idx' },
);
CustomerEventSchema.index(
  { eventType: 1, createdAt: -1 },
  { name: 'eventType_createdAt_idx' },
);
CustomerEventSchema.index(
  { userId: 1, createdAt: -1 },
  { name: 'userId_createdAt_idx' },
);
CustomerEventSchema.index(
  { score: 1, createdAt: -1 },
  { name: 'score_createdAt_idx' },
);
