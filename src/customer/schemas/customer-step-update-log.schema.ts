import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CustomerStepUpdateLogDocument = HydratedDocument<CustomerStepUpdateLog>;

/**
 * Append-only log when a customer's pipeline step (`customerStepId`) changes.
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'customer_step_update_logs',
})
export class CustomerStepUpdateLog {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CustomerStep', required: false })
  fromCustomerStepId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CustomerStep', required: true })
  toCustomerStepId: Types.ObjectId;

  @Prop({ type: String, required: false })
  actorUserId?: string;
}

export const CustomerStepUpdateLogSchema = SchemaFactory.createForClass(CustomerStepUpdateLog);
