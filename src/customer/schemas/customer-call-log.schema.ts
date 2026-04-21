import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Customer } from './customer.schema';

export type CustomerCallLogDocument = HydratedDocument<CustomerCallLog>;
export type CustomerCallEvent = {
  eventType: string;
  timestamp: Date;
  status?: string;
  durationSeconds?: number;
  recordingUrl?: string;
  transcript?: string;
  metadata?: Record<string, unknown>;
};
export type CustomerCallUtterance = {
  speaker?: string;
  text?: string;
  confidence?: number;
  start?: number;
  end?: number;
};

@Schema({ collection: 'customer_call_logs', timestamps: true })
export class CustomerCallLog {
  @Prop({ type: Types.ObjectId, ref: Customer.name, required: false, index: true })
  customerId?: Types.ObjectId;

  @Prop({ required: true, default: 'twilio', index: true })
  provider: string;

  @Prop({ required: true, index: true })
  callSid: string;

  @Prop({ required: false })
  from?: string;

  @Prop({ required: false })
  to?: string;

  @Prop({ required: false, index: true })
  status?: string;

  @Prop({ required: false, index: true })
  direction?: string;

  @Prop({ required: false })
  durationSeconds?: number;

  @Prop({ required: false })
  recordingUrl?: string;

  @Prop({ required: false })
  transcript?: string;

  @Prop({ required: false })
  text?: string;

  @Prop({
    type: [
      {
        speaker: { type: String, required: false },
        text: { type: String, required: false },
        confidence: { type: Number, required: false },
        start: { type: Number, required: false },
        end: { type: Number, required: false },
      },
    ],
    default: [],
  })
  utterances?: CustomerCallUtterance[];

  @Prop({ required: false, index: true })
  customerExternalRef?: string;

  @Prop({ required: false, index: true })
  agentExternalRef?: string;

  @Prop({
    type: [
      {
        eventType: { type: String, required: true },
        timestamp: { type: Date, required: true },
        status: { type: String, required: false },
        durationSeconds: { type: Number, required: false },
        recordingUrl: { type: String, required: false },
        transcript: { type: String, required: false },
        metadata: { type: Object, required: false },
      },
    ],
    default: [],
  })
  events: CustomerCallEvent[];

  @Prop({ type: Object, required: false })
  metadata?: Record<string, unknown>;
}

export const CustomerCallLogSchema =
  SchemaFactory.createForClass(CustomerCallLog);

CustomerCallLogSchema.index(
  { callSid: 1 },
  { unique: true, name: 'callSid_unique' },
);
