import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CustomerWhatsappChatDocument = CustomerWhatsappChat & Document;

@Schema({ timestamps: true })
export class CustomerWhatsappChat {
  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true, index: true })
  chatId: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ default: '' })
  name: string;

  @Prop({ default: false })
  isGroup: boolean;

  @Prop({ default: null })
  userSessionId?: string | null;

  @Prop({ default: 0 })
  lastMessageTimestamp: number;
}

export const CustomerWhatsappChatSchema =
  SchemaFactory.createForClass(CustomerWhatsappChat);

CustomerWhatsappChatSchema.index({ customerId: 1, chatId: 1 });
CustomerWhatsappChatSchema.index({ sessionId: 1, chatId: 1 }, { unique: true });
