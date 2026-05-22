import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CustomerChangeLogDocument = HydratedDocument<CustomerChangeLog>;

export type CustomerChangeEntry = {
  readonly field: string;
  readonly from: unknown;
  readonly to: unknown;
};

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class CustomerChangeLog {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  /** Office user id from JWT (`userId` / `sub`) when the change came from the API. */
  @Prop({ type: String, required: false })
  actorUserId?: string;

  @Prop({ type: String, enum: ['create', 'update'], required: true })
  action: 'create' | 'update';

  @Prop({
    type: [
      {
        field: { type: String, required: true },
        from: { type: MongooseSchema.Types.Mixed, required: false },
        to: { type: MongooseSchema.Types.Mixed, required: false },
      },
    ],
    default: [],
  })
  changes: CustomerChangeEntry[];
}

export const CustomerChangeLogSchema =
  SchemaFactory.createForClass(CustomerChangeLog);

CustomerChangeLogSchema.index({ createdAt: -1 });
