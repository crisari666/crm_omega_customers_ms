import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

export enum DocumentType {
  Cc = 'cc',
  Passport = 'passport',
}

/**
 * CRM customer aggregate (crm-omega-customers-ms MongoDB).
 * Meta exclusive-WABA ingress persists here only; it does not sync to omega_office_back `LeadCandidate`
 * unless a separate integration is introduced.
 */
@Schema({ timestamps: true })
export class Customer {
  @Prop({ required: false })
  name: string;

  @Prop({ required: false })
  lastName: string;

  /**
   * Canonical contact number (trimmed, no spaces). Unique.
   * `whatsapp` is stored to the same value on create so both fields stay aligned.
   */
  @Prop({ required: true, index: true, unique: true })
  phone: string;

  /** Same canonical string as `phone`; optional on legacy docs. */
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
  
  @Prop()
  assignedDate?: string;

  /**
   * Meta potential-customer funnel: pending_flow until WhatsApp Flow completes;
   * completed_flow after flow; ready_for_llm after ventor assignment (LLM path in whatsapp_cloud_ms).
   */
  @Prop({
    type: String,
    enum: ['none', 'pending_flow', 'completed_flow', 'ready_for_llm'],
    default: 'none',
  })
  whatsappPotentialCustomerStatus?: 'none' | 'pending_flow' | 'completed_flow' | 'ready_for_llm';

  /** True after `potential_customer` template was requested for this funnel. */
  @Prop({ type: Boolean, default: false })
  metaPotentialTemplateSent?: boolean;

  @Prop({ type: Types.ObjectId, ref: 'CustomerStep', required: false, index: true })
  customerStepId?: Types.ObjectId;

  /**
   * When false, customer treated as disabled (excluded from active flows). Defaults to true.
   */
  @Prop({ type: Boolean, default: true, index: true })
  enabled?: boolean;
  @Prop({ type: Boolean, default: false, index: true })
  isReferral?: boolean;

  @Prop({ type: Boolean, default: false, index: true })
  isInternational?: boolean;

  @Prop({ required: true })
  createdBy: string;

  /** Latest CRM customer_event activity time (denormalized for list sort). */
  @Prop({ type: Date, required: false, index: true })
  lastUpdate?: Date;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ createdAt: -1 });
CustomerSchema.index({ createdAt: -1, assignedTo: 1 });
CustomerSchema.index({ lastUpdate: -1, createdAt: -1 });

/** Change history uses pre/post `save` hooks attached in {@link CustomerAuditService.attachCustomerSchemaHooks}. */
