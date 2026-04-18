import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Customer } from './customer.schema';

export type CustomerDescriptionDocument = HydratedDocument<CustomerDescription>;

@Schema({ collection: 'customer_descriptions', timestamps: false })
export class CustomerDescription {
  @Prop({ type: Types.ObjectId, ref: Customer.name, required: true })
  customerId: Types.ObjectId;

  @Prop({ required: true })
  user: string;

  @Prop({ required: true, default: () => new Date() })
  date: Date;

  @Prop({ required: true })
  description: string;
}

export const CustomerDescriptionSchema =
  SchemaFactory.createForClass(CustomerDescription);
