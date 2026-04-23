import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomerWhatsappUnresolvedDocument = CustomerWhatsappUnresolved & Document;

@Schema({ timestamps: true })
export class CustomerWhatsappUnresolved {
  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true, index: true })
  messageId: string;

  @Prop({ required: true, index: true })
  chatId: string;

  @Prop({ default: null })
  fromPhone?: string | null;

  @Prop({ default: null })
  toPhone?: string | null;

  @Prop({ type: Object, required: true })
  payload: object;
}

export const CustomerWhatsappUnresolvedSchema =
  SchemaFactory.createForClass(CustomerWhatsappUnresolved);

CustomerWhatsappUnresolvedSchema.index({ sessionId: 1, messageId: 1 }, { unique: true });
