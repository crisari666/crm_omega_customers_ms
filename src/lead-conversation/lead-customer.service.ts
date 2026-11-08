import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerService } from '../customer/customer.service';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import {
  MetaLeadCampaign,
  MetaLeadCampaignDocument,
} from '../customer/schemas/meta-lead-campaign.schema';
import { findCustomersByPhoneCandidates } from '../customer/utils/find-customer-by-phone-candidates.util';
import { normalizeCustomerPhone } from '../customer/utils/normalize-customer-phone.util';

const FALLBACK_CUSTOMER_NAME = 'Contacto';
const LEAD_BOT_ACTOR_ID = 'lead-conversation-bot';

export type ResolveCanonicalCustomerResult = {
  readonly customerId: Types.ObjectId;
  readonly rematched: boolean;
  readonly previousCustomerId?: Types.ObjectId;
};

export type LeadCustomerIdentityInput = {
  readonly waId: string;
  readonly profileName: string;
  readonly actorUserId: string;
  readonly email?: string;
  readonly whatsappUsername?: string;
  readonly metaWhatsappUserId?: string;
  readonly ctwaClid?: string;
};

/** Customer lookup/creation for the lead qualification line (reuses CustomerService rules). */
@Injectable()
export class LeadCustomerService {
  private readonly logger = new Logger(LeadCustomerService.name);

  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(MetaLeadCampaign.name)
    private readonly metaLeadCampaignModel: Model<MetaLeadCampaignDocument>,
    private readonly customerService: CustomerService,
  ) {}

  /**
   * Resolves the Ceiba/leadgen Customer (phone → email → metaWhatsappUserId) or creates a lead.
   * Enrichment never clears `assignedTo`.
   */
  async findOrCreateByWaId(input: LeadCustomerIdentityInput): Promise<CustomerDocument> {
    const phone = normalizeCustomerPhone(input.waId);
    const byPhone = await findCustomersByPhoneCandidates(this.customerModel, phone);
    let preferred = await this.pickPreferredCustomer(byPhone);
    if (!preferred && input.email) {
      preferred = await this.findByEmail(input.email);
    }
    if (!preferred && input.metaWhatsappUserId) {
      preferred = await this.findByMetaWhatsappUserId(input.metaWhatsappUserId);
    }
    if (preferred) {
      await this.enrichCustomerIdentity(preferred, { ...input, waId: phone });
      await this.stampMetaLeadCampaignWhatsappIdentity(preferred._id as Types.ObjectId, input);
      await this.customerService.tagLeadIngress(preferred._id as Types.ObjectId, 'whatsapp_lead_conversation');
      return preferred;
    }
    const { name, lastName } = splitProfileName(input.profileName);
    try {
      return await this.customerService.createCustomer(
        {
          name,
          lastName,
          phone,
          whatsapp: phone,
          lifecycleStatus: 'lead',
          leadSources: ['whatsapp_lead_conversation'],
          ...(input.email ? { email: input.email } : {}),
          ...(input.whatsappUsername ? { whatsappUsername: input.whatsappUsername } : {}),
          ...(input.metaWhatsappUserId ? { metaWhatsappUserId: input.metaWhatsappUserId } : {}),
          ...(input.ctwaClid ? { metaCtwaClid: input.ctwaClid } : {}),
        },
        input.actorUserId,
      );
    } catch (err) {
      if (!(err instanceof ConflictException)) throw err;
      const raced = await findCustomersByPhoneCandidates(this.customerModel, phone);
      const racedPreferred = await this.pickPreferredCustomer(raced);
      if (!racedPreferred) throw err;
      await this.enrichCustomerIdentity(racedPreferred, { ...input, waId: phone });
      await this.stampMetaLeadCampaignWhatsappIdentity(racedPreferred._id as Types.ObjectId, input);
      await this.customerService.tagLeadIngress(
        racedPreferred._id as Types.ObjectId,
        'whatsapp_lead_conversation',
      );
      return racedPreferred;
    }
  }

  async findById(customerId: Types.ObjectId): Promise<CustomerDocument | null> {
    return this.customerModel.findById(customerId).exec();
  }

  /**
   * On schedule: re-resolve by hardened CO phone variants so Meta-ad + WA share one Customer `_id`.
   */
  async resolveCanonicalCustomerForSchedule(input: {
    readonly customerId: Types.ObjectId;
    readonly waId: string;
    readonly profileName?: string;
  }): Promise<ResolveCanonicalCustomerResult> {
    const matches = await findCustomersByPhoneCandidates(this.customerModel, input.waId);
    const current = matches.find((row) => String(row._id) === String(input.customerId));
    const preferred = (await this.pickPreferredCustomer(matches)) ?? current ?? null;
    if (!preferred) {
      return { customerId: input.customerId, rematched: false };
    }
    const rematched = String(preferred._id) !== String(input.customerId);
    if (rematched) {
      this.logger.warn(
        `Lead schedule rematch customer sessionWas=${String(input.customerId)} canonical=${String(preferred._id)} waId=${input.waId}`,
      );
    }
    if (input.profileName) {
      await this.fillNameIfEmpty(preferred, input.profileName);
    }
    return {
      customerId: preferred._id as Types.ObjectId,
      rematched,
      ...(rematched ? { previousCustomerId: input.customerId } : {}),
    };
  }

  /**
   * Assigns the customer to a ventor. When `overwrite` is false (default for bot booking),
   * keeps an existing Meta/CRM assignee — especially `immediate_assign` form leads.
   */
  async assignToVentor(
    customerId: Types.ObjectId,
    ventorId: string,
    actorUserId = LEAD_BOT_ACTOR_ID,
    options: { readonly overwrite?: boolean } = {},
  ): Promise<void> {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) return;
    const existing = (customer.assignedTo ?? '').trim();
    const overwrite = options.overwrite === true;
    if (existing.length > 0 && !overwrite) {
      const isImmediateAssign = await this.hasImmediateAssignCampaign(customerId);
      if (isImmediateAssign) {
        this.logger.warn(
          `Skip assignToVentor immediate_assign customer=${String(customerId)} keeps=${existing} ignored=${ventorId}`,
        );
      } else {
        this.logger.debug(
          `Skip assignToVentor customer=${String(customerId)} keeps=${existing} ignored=${ventorId}`,
        );
      }
      return;
    }
    if (!overwrite && (await this.hasImmediateAssignCampaign(customerId))) {
      const refreshed = await this.customerModel.findById(customerId).select({ assignedTo: 1 }).exec();
      const raceAssignee = (refreshed?.assignedTo ?? '').trim();
      if (raceAssignee.length > 0) {
        this.logger.warn(
          `Skip assignToVentor immediate_assign race customer=${String(customerId)} keeps=${raceAssignee} ignored=${ventorId}`,
        );
        return;
      }
    }
    customer.assignedTo = ventorId;
    customer.assignedDate = new Date().toISOString();
    customer.$locals['__auditActorUserId'] = actorUserId;
    await customer.save();
  }

  /** True when the newest Meta campaign for this customer used registry `immediate_assign`. */
  private async hasImmediateAssignCampaign(customerId: Types.ObjectId): Promise<boolean> {
    const campaign = await this.metaLeadCampaignModel
      .findOne({ customerId, flowStrategy: 'immediate_assign' })
      .select({ _id: 1 })
      .lean()
      .exec();
    return campaign != null;
  }

  /** Adds the project to `interestedProjects` once. */
  async addInterestedProject(customerId: Types.ObjectId, projectId: string, actorUserId: string): Promise<void> {
    await this.customerModel
      .updateOne(
        { _id: customerId, 'interestedProjects.projectId': { $ne: projectId } },
        { $push: { interestedProjects: { projectId, date: new Date(), addedBy: actorUserId } } },
      )
      .exec();
  }

  /**
   * Prefer Meta-linked customer, else earliest createdAt (matches already sorted ascending).
   */
  private async pickPreferredCustomer(
    matches: readonly CustomerDocument[],
  ): Promise<CustomerDocument | null> {
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    const ids = matches.map((row) => row._id);
    const metaLinked = await this.metaLeadCampaignModel
      .find({ customerId: { $in: ids } })
      .select({ customerId: 1 })
      .lean()
      .exec();
    const metaIds = new Set(metaLinked.map((row) => String(row.customerId)));
    const withMeta = matches.find((row) => metaIds.has(String(row._id)));
    return withMeta ?? matches[0];
  }

  private async findByEmail(email: string): Promise<CustomerDocument | null> {
    const trimmed = email.trim();
    if (!trimmed) return null;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.customerModel
      .findOne({ email: { $regex: new RegExp(`^${escaped}$`, 'i') } })
      .exec();
  }

  /**
   * Stamps WA nick / Meta user id on the newest Meta lead campaign for this customer (bridge visibility).
   */
  private async stampMetaLeadCampaignWhatsappIdentity(
    customerId: Types.ObjectId,
    input: LeadCustomerIdentityInput,
  ): Promise<void> {
    const $set: Record<string, string> = {};
    if (input.whatsappUsername?.trim()) $set.whatsappUsername = input.whatsappUsername.trim();
    if (input.metaWhatsappUserId?.trim()) $set.metaWhatsappUserId = input.metaWhatsappUserId.trim();
    if (Object.keys($set).length === 0) return;
    const campaign = await this.metaLeadCampaignModel
      .findOne({ customerId })
      .sort({ createdAt: -1 })
      .select({ _id: 1 })
      .lean()
      .exec();
    if (!campaign?._id) return;
    await this.metaLeadCampaignModel.updateOne({ _id: campaign._id }, { $set }).exec();
  }

  private async findByMetaWhatsappUserId(metaWhatsappUserId: string): Promise<CustomerDocument | null> {
    const trimmed = metaWhatsappUserId.trim();
    if (!trimmed) return null;
    return this.customerModel.findOne({ metaWhatsappUserId: trimmed }).exec();
  }

  private async enrichCustomerIdentity(
    customer: CustomerDocument,
    input: LeadCustomerIdentityInput,
  ): Promise<void> {
    const phone = normalizeCustomerPhone(input.waId);
    const existingPhone = normalizeCustomerPhone(customer.phone ?? '');
    if (phone && existingPhone && phone !== existingPhone) {
      this.logger.warn(
        `Identity enrich phone mismatch customer=${String(customer._id)} ` +
          `keptPhone=${existingPhone} formWaId=${phone} (phone not overwritten)`,
      );
    }
    let dirty = false;
    if (input.profileName) {
      const filled = this.applyNameIfEmpty(customer, input.profileName);
      dirty = dirty || filled;
    }
    if (input.email && !(customer.email ?? '').trim()) {
      customer.email = input.email.trim();
      dirty = true;
    }
    if (input.whatsappUsername && !(customer.whatsappUsername ?? '').trim()) {
      customer.whatsappUsername = input.whatsappUsername.trim();
      dirty = true;
    }
    if (input.metaWhatsappUserId && !(customer.metaWhatsappUserId ?? '').trim()) {
      customer.metaWhatsappUserId = input.metaWhatsappUserId.trim();
      dirty = true;
    }
    if (input.ctwaClid && !(customer.metaCtwaClid ?? '').trim()) {
      customer.metaCtwaClid = input.ctwaClid.trim();
      dirty = true;
    }
    if (phone && !(customer.whatsapp ?? '').trim()) {
      customer.whatsapp = phone;
      dirty = true;
    }
    if (!dirty) return;
    customer.$locals['__auditActorUserId'] = LEAD_BOT_ACTOR_ID;
    await customer.save();
  }

  private async fillNameIfEmpty(customer: CustomerDocument, profileName: string): Promise<void> {
    if (!this.applyNameIfEmpty(customer, profileName)) return;
    customer.$locals['__auditActorUserId'] = LEAD_BOT_ACTOR_ID;
    await customer.save();
  }

  private applyNameIfEmpty(customer: CustomerDocument, profileName: string): boolean {
    const currentName = (customer.name ?? '').trim();
    const hasName = currentName.length > 0 && currentName !== FALLBACK_CUSTOMER_NAME;
    if (hasName) return false;
    const { name, lastName } = splitProfileName(profileName);
    customer.name = name;
    if (!(customer.lastName ?? '').trim()) {
      customer.lastName = lastName;
    }
    return true;
  }
}

function splitProfileName(full: string): { name: string; lastName: string } {
  const parts = full.trim().split(/\s+/u).filter((part) => part !== '');
  if (parts.length === 0) return { name: FALLBACK_CUSTOMER_NAME, lastName: '' };
  return { name: parts[0], lastName: parts.slice(1).join(' ') };
}
