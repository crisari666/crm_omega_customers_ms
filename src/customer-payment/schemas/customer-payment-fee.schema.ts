import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerPaymentFeeDocument = HydratedDocument<CustomerPaymentFee>;

@Schema({ timestamps: true, collection: 'customer_payment_fees' })
export class CustomerPaymentFee {
  @Prop({ required: true, index: true })
  downPaymentId: string;

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

  @Prop({ trim: true })
  evidenceMimeType?: string;

  @Prop({ trim: true })
  evidenceStoredFileName?: string;

  @Prop({ required: true, index: true })
  recordedBy: string;
}

export const CustomerPaymentFeeSchema =
  SchemaFactory.createForClass(CustomerPaymentFee);

CustomerPaymentFeeSchema.index({ downPaymentId: 1, datePayment: -1 });
CustomerPaymentFeeSchema.index({ customerId: 1, datePayment: -1 });
