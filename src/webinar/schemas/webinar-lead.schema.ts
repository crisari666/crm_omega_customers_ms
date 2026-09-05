import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WebinarLeadDocument = HydratedDocument<WebinarLead>;

export enum WebinarLeadStatus {
  Registered = 'registered',
  Converted = 'converted',
  Discarded = 'discarded',
}

export type WebinarLeadFieldDataRow = {
  name: string;
  values: string[];
};

/**
 * Lead registered via Formulario_MasterClass Meta Lead Ads; may later convert to Customer.
 */
@Schema({ timestamps: true, collection: 'webinar_leads' })
export class WebinarLead {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: false, default: '' })
  lastName: string;

  @Prop({ type: String, required: false, default: '' })
  email: string;

  @Prop({ type: String, required: true, index: true })
  phone: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  metaLeadgenId: string;

  @Prop({ type: String, required: false, index: true })
  formName?: string;

  /** Flattened Meta form answers + campaign scalars (key → first/joined values). */
  @Prop({ type: Object, default: {} })
  mappedFields: Record<string, string>;

  /** Raw Meta `field_data` rows from Graph (preserves multi-value answers). */
  @Prop({
    type: [
      {
        name: { type: String, required: true },
        values: { type: [String], default: [] },
      },
    ],
    default: [],
  })
  fieldData: WebinarLeadFieldDataRow[];

  /** Original leadgen webhook `value` from Meta page subscription. */
  @Prop({ type: Object, required: false })
  rawWebhookValue?: Record<string, unknown>;

  @Prop({ type: String, required: false })
  pageId?: string;

  @Prop({ type: String, required: false })
  formId?: string;

  @Prop({ type: String, required: false })
  adId?: string;

  @Prop({ type: String, required: false })
  platform?: string;

  @Prop({ type: String, required: false })
  campaignName?: string;

  @Prop({ type: String, required: false })
  graphCreatedTime?: string;

  @Prop({ type: Types.ObjectId, ref: 'WebinarEvent', required: false, index: true })
  webinarEventId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: false, index: true })
  customerId?: Types.ObjectId | null;

  @Prop({ type: Date, required: false })
  notificationSentAt?: Date | null;

  @Prop({ type: String, required: false })
  whatsappMessageId?: string;

  @Prop({ type: String, required: false })
  notificationError?: string;

  @Prop({
    type: String,
    enum: WebinarLeadStatus,
    default: WebinarLeadStatus.Registered,
    index: true,
  })
  status: WebinarLeadStatus;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: false })
  convertedCustomerId?: Types.ObjectId | null;

  @Prop({ type: Date, required: false })
  convertedAt?: Date | null;

  @Prop({ type: String, required: false })
  gatewayReceivedAt?: string;
}

export const WebinarLeadSchema = SchemaFactory.createForClass(WebinarLead);

WebinarLeadSchema.index(
  { webinarEventId: 1, phone: 1 },
  {
    unique: true,
    partialFilterExpression: {
      webinarEventId: { $type: 'objectId' },
      phone: { $type: 'string' },
    },
  },
);
WebinarLeadSchema.index({ status: 1, createdAt: -1 });
WebinarLeadSchema.index({ createdAt: -1 });
