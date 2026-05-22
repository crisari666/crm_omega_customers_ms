import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CustomerAssignmentChangeLogDocument =
  HydratedDocument<CustomerAssignmentChangeLog>;

/**
 * Append-only log when a customer's `assignedTo` changes (admin assign, create with assignee, ventor auto-assign).
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class CustomerAssignmentChangeLog {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: String, required: false })
  actorUserId?: string;

  @Prop({ type: String, enum: ['create', 'update'], required: true })
  action: 'create' | 'update';

  /** Previous office user id (`assignedTo` before change). */
  @Prop({ type: String, required: false })
  assignedFrom?: string;

  /** New office user id (`assignedTo` after change). */
  @Prop({ type: String, required: false, index: true })
  assignedTo?: string;
}

export const CustomerAssignmentChangeLogSchema = SchemaFactory.createForClass(
  CustomerAssignmentChangeLog,
);

CustomerAssignmentChangeLogSchema.index({ assignedTo: 1, createdAt: -1 });
CustomerAssignmentChangeLogSchema.index({ customerId: 1, createdAt: -1 });
CustomerAssignmentChangeLogSchema.index({ createdAt: -1 });
