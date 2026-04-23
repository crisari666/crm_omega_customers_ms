import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CustomerWhatsappMessageDocument = CustomerWhatsappMessage & Document;

@Schema({ timestamps: true })
export class CustomerWhatsappMessage {
  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true, index: true })
  messageId: string;

  @Prop({ required: true, index: true })
  chatId: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ default: false })
  fromMe: boolean;

  @Prop({ default: '' })
  body: string;

  @Prop({ default: 'chat' })
  type: string;

  @Prop({ required: true, index: true })
  timestamp: number;

  @Prop({ default: false })
  hasMedia: boolean;

  @Prop({ default: null })
  mediaType?: string | null;

  @Prop({ default: null })
  mediaPath?: string | null;

  @Prop({ default: null })
  mediaMimeType?: string | null;

  @Prop({ default: null })
  mediaFilename?: string | null;

  @Prop({ default: 'live' })
  syncMode: 'live' | 'session_backfill';
}

export const CustomerWhatsappMessageSchema =
  SchemaFactory.createForClass(CustomerWhatsappMessage);

CustomerWhatsappMessageSchema.index({ sessionId: 1, messageId: 1 }, { unique: true });
CustomerWhatsappMessageSchema.index({ customerId: 1, chatId: 1, timestamp: 1 });
