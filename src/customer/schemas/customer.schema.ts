import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

export enum DocumentType {
  Cc = 'cc',
  Passport = 'passport',
}

@Schema({ timestamps: true })
export class Customer {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
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

  @Prop({ type: [String], default: [] })
  description: string[];

  @Prop()
  assignedTo?: string;

  @Prop({ required: true })
  createdBy: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
