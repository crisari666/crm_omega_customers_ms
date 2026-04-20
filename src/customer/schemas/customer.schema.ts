import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

export enum DocumentType {
  Cc = 'cc',
  Passport = 'passport',
}

@Schema({ timestamps: true })
export class Customer {
  @Prop({ required: false })
  name: string;

  @Prop({ required: false })
  lastName: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  whatsapp?: string;

  @Prop()
  email?: string;

  @Prop({ type: String, enum: DocumentType })
  documentType?: DocumentType;

  @Prop()
  document?: string;

  @Prop({
    type: [
      {
        projectId: { type: String, required: true },
        date: { type: Date, required: true },
        addedBy: { type: String, required: false },
      },
    ],
    default: [],
  })
  interestedProjects: { projectId: string; date: Date; addedBy?: string }[];

  /** `_id` values pointing at documents in the `customer_descriptions` collection. */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'CustomerDescription' }],
    default: [],
  })
  description: Types.ObjectId[];

  @Prop()
  assignedTo?: string;

  @Prop({ type: Types.ObjectId, ref: 'CustomerStep', required: false, index: true })
  customerStepId?: Types.ObjectId;

  /**
   * When false, customer treated as disabled (excluded from active flows). Defaults to true.
   */
  @Prop({ type: Boolean, default: true, index: true })
  enabled?: boolean;

  @Prop({ required: true })
  createdBy: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

/** Change history uses pre/post `save` hooks attached in {@link CustomerAuditService.attachCustomerSchemaHooks}. */
