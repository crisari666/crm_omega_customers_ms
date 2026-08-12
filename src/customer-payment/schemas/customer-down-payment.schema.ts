import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerDownPaymentDocument = HydratedDocument<CustomerDownPayment>;

export enum CustomerDownPaymentStatus {
  Pending = 'pending',
  Completed = 'completed',
}

@Schema({ timestamps: true, collection: 'customer_down_payments' })
export class CustomerDownPayment {
  @Prop({ required: true, index: true })
  customerId: string;

  @Prop({ required: true, index: true })
  projectId: string;

  @Prop({ required: true, trim: true })
  lotNumber: string;

  @Prop({ required: true })
  expectedValue: number;

  @Prop({
    type: String,
    enum: CustomerDownPaymentStatus,
    required: true,
    default: CustomerDownPaymentStatus.Pending,
    index: true,
  })
  status: CustomerDownPaymentStatus;

  @Prop({ required: true, default: 0 })
  totalPaid: number;

  @Prop({ required: true, default: 0 })
  feeCount: number;

  @Prop({ trim: true })
  customerName?: string;

  @Prop({ trim: true })
  projectName?: string;

  @Prop({ required: true, trim: true })
  contractMimeType: string;

  @Prop({ required: true, trim: true })
  contractStoredFileName: string;

  @Prop({ required: true, index: true })
  recordedBy: string;
}

export const CustomerDownPaymentSchema = SchemaFactory.createForClass(
  CustomerDownPayment,
);

CustomerDownPaymentSchema.index({ customerId: 1, projectId: 1 }, { unique: true });
CustomerDownPaymentSchema.index({ createdAt: -1 });
CustomerDownPaymentSchema.index({ recordedBy: 1, createdAt: -1 });
