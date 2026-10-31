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

  async findOrCreateByWaId(waId: string, profileName: string, actorUserId: string): Promise<CustomerDocument> {
    const phone = normalizeCustomerPhone(waId);
    const matches = await findCustomersByPhoneCandidates(this.customerModel, phone);
    const preferred = await this.pickPreferredCustomer(matches);
    if (preferred) {
      await this.customerService.tagLeadIngress(preferred._id as Types.ObjectId, 'whatsapp_lead_conversation');
      return preferred;
    }
    const { name, lastName } = splitProfileName(profileName);
    try {
      return await this.customerService.createCustomer(
        {
          name,
          lastName,
          phone,
          whatsapp: phone,
          lifecycleStatus: 'lead',
          leadSources: ['whatsapp_lead_conversation'],
        },
        actorUserId,
      );
    } catch (err) {
      if (!(err instanceof ConflictException)) throw err;
      const raced = await findCustomersByPhoneCandidates(this.customerModel, phone);
      const racedPreferred = await this.pickPreferredCustomer(raced);
      if (!racedPreferred) throw err;
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

  /** Assigns the customer to the office user who owns the booked lead call (overwrites any previous assignee). */
  async assignToVentor(customerId: Types.ObjectId, ventorId: string, actorUserId = LEAD_BOT_ACTOR_ID): Promise<void> {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) return;
    customer.assignedTo = ventorId;
    customer.assignedDate = new Date().toISOString();
    customer.$locals['__auditActorUserId'] = actorUserId;
    await customer.save();
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

  private async fillNameIfEmpty(customer: CustomerDocument, profileName: string): Promise<void> {
    const hasName = customer.name.trim().length > 0 && customer.name.trim() !== FALLBACK_CUSTOMER_NAME;
    if (hasName) return;
    const { name, lastName } = splitProfileName(profileName);
    customer.name = name;
    if (!customer.lastName?.trim()) {
      customer.lastName = lastName;
    }
    customer.$locals['__auditActorUserId'] = LEAD_BOT_ACTOR_ID;
    await customer.save();
  }
}

function splitProfileName(full: string): { name: string; lastName: string } {
  const parts = full.trim().split(/\s+/u).filter((part) => part !== '');
  if (parts.length === 0) return { name: FALLBACK_CUSTOMER_NAME, lastName: '' };
  return { name: parts[0], lastName: parts.slice(1).join(' ') };
}
