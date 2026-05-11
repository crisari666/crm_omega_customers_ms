import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerPaymentDocument = HydratedDocument<CustomerPayment>;

@Schema({ timestamps: true, collection: 'customer_payments' })
export class CustomerPayment {
  @Prop({ required: true, index: true })
  customerId: string;

  @Prop({ required: true, index: true })
  projectId: string;

  @Prop({ required: true })
  paymentValue: number;

  @Prop({ required: true })
  datePayment: Date;

  @Prop({ trim: true })
  receiptNumber?: string;

  @Prop({ trim: true })
  paymentMethod?: string;

  @Prop({ trim: true, maxlength: 2000 })
  notes?: string;

  @Prop({ required: true, index: true })
  recordedBy: string;
}

export const CustomerPaymentSchema =
  SchemaFactory.createForClass(CustomerPayment);

CustomerPaymentSchema.index({ customerId: 1, projectId: 1 });
CustomerPaymentSchema.index({ datePayment: 1 });
CustomerPaymentSchema.index({ recordedBy: 1, datePayment: 1 });
