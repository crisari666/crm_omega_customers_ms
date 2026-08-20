import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Customer } from '../../customer/schemas/customer.schema';

export type CustomerMetadataDocument = HydratedDocument<CustomerMetadata>;

/**
 * Stage 3 qualification metadata for one customer (crm-omega-customers-ms).
 * Values are keyed by the code-defined field catalog.
 */
@Schema({ timestamps: true, collection: 'customer_metadata' })
export class CustomerMetadata {
  @Prop({
    type: Types.ObjectId,
    ref: Customer.name,
    required: true,
    unique: true,
    index: true,
  })
  customerId: Types.ObjectId;

  @Prop({ type: Map, of: String, default: {} })
  values: Map<string, string>;

  @Prop({ required: true })
  updatedBy: string;
}

export const CustomerMetadataSchema =
  SchemaFactory.createForClass(CustomerMetadata);
