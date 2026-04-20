import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerStepDocument = HydratedDocument<CustomerStep>;

@Schema({ timestamps: true, collection: 'customer_steps' })
export class CustomerStep {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: false, trim: true })
  description?: string;

  @Prop({ required: true, default: 0, index: true })
  order: number;

  @Prop({ required: false, trim: true })
  color?: string;

  @Prop({ type: Boolean, required: true, default: true, index: true })
  isActive: boolean;

  @Prop({ required: true, index: true })
  createdBy: string;

  @Prop({ required: true, index: true })
  updatedBy: string;
}

export const CustomerStepSchema = SchemaFactory.createForClass(CustomerStep);
