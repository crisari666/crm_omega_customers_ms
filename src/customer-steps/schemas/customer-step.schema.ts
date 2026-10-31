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

  /** CRM flag for potential-buyer steps (not used for mine-list duration). */
  @Prop({ type: Boolean, required: true, default: false, index: true })
  isPotentialBuyer: boolean;

  /**
   * Optional days a customer on this step stays on the ventor mine list after
   * assignment (`assignedDate`, else `createdAt`). When unset, mine list uses 30.
   */
  @Prop({ type: Number, required: false, min: 1 })
  ventorMineVisibilityDays?: number;

  @Prop({ required: true, index: true })
  createdBy: string;

  @Prop({ required: true, index: true })
  updatedBy: string;
}

export const CustomerStepSchema = SchemaFactory.createForClass(CustomerStep);
