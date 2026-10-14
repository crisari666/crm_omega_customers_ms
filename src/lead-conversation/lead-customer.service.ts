import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerService } from '../customer/customer.service';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { findCustomerByPhoneCandidates } from '../customer/utils/find-customer-by-phone-candidates.util';
import { normalizeCustomerPhone } from '../customer/utils/normalize-customer-phone.util';

const FALLBACK_CUSTOMER_NAME = 'Contacto';
const LEAD_BOT_ACTOR_ID = 'lead-conversation-bot';

/** Customer lookup/creation for the lead qualification line (reuses CustomerService rules). */
@Injectable()
export class LeadCustomerService {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    private readonly customerService: CustomerService,
  ) {}

  async findOrCreateByWaId(waId: string, profileName: string, actorUserId: string): Promise<CustomerDocument> {
    const phone = normalizeCustomerPhone(waId);
    const existing = await findCustomerByPhoneCandidates(this.customerModel, phone);
    if (existing) return existing;
    const { name, lastName } = splitProfileName(profileName);
    try {
      return await this.customerService.createCustomer({ name, lastName, phone, whatsapp: phone }, actorUserId);
    } catch (err) {
      if (!(err instanceof ConflictException)) throw err;
      const raced = await findCustomerByPhoneCandidates(this.customerModel, phone);
      if (!raced) throw err;
      return raced;
    }
  }

  async findById(customerId: Types.ObjectId): Promise<CustomerDocument | null> {
    return this.customerModel.findById(customerId).exec();
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
}

function splitProfileName(full: string): { name: string; lastName: string } {
  const parts = full.trim().split(/\s+/u).filter((part) => part !== '');
  if (parts.length === 0) return { name: FALLBACK_CUSTOMER_NAME, lastName: '' };
  return { name: parts[0], lastName: parts.slice(1).join(' ') };
}
