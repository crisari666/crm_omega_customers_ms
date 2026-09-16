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

  /** When true, ventor mine list keeps customers on this step for 15 extra days past the default window. */
  @Prop({ type: Boolean, required: true, default: false, index: true })
  isPotentialBuyer: boolean;

  @Prop({ required: true, index: true })
  createdBy: string;

  @Prop({ required: true, index: true })
  updatedBy: string;
}

export const CustomerStepSchema = SchemaFactory.createForClass(CustomerStep);
