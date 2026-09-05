import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { CustomerService } from '../customer/customer.service';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { findCustomerByPhoneCandidates } from '../customer/utils/find-customer-by-phone-candidates.util';
import { normalizeCustomerPhone } from '../customer/utils/normalize-customer-phone.util';
import { WEBINAR_INGEST_ACTOR_ID } from './constants/webinar-notification.constants';
import { CreateWebinarLeadDto } from './dto/create-webinar-lead.dto';
import { CreateWebinarLeadItemDto } from './dto/create-webinar-lead-item.dto';
import { ImportWebinarLeadsDto } from './dto/import-webinar-leads.dto';
import { ListWebinarLeadsQueryDto } from './dto/list-webinar-leads.query.dto';
import {
  WebinarEvent,
  WebinarEventDocument,
} from './schemas/webinar-event.schema';
import {
  WebinarLead,
  WebinarLeadDocument,
  WebinarLeadStatus,
} from './schemas/webinar-lead.schema';
import type {
  ImportWebinarLeadResultItem,
  ImportWebinarLeadsResponse,
} from './types/import-webinar-leads-result.type';
import { WebinarIngestService } from './webinar-ingest.service';

export type WebinarLeadsListResult = {
  readonly items: WebinarLeadDocument[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
};

/**
 * Admin list/detail and convert webinar leads to customers.
 */
@Injectable()
export class WebinarLeadsService {
  private readonly logger = new Logger(WebinarLeadsService.name);

  constructor(
    @InjectModel(WebinarLead.name)
    private readonly webinarLeadModel: Model<WebinarLeadDocument>,
    @InjectModel(WebinarEvent.name)
    private readonly webinarEventModel: Model<WebinarEventDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly customerService: CustomerService,
    private readonly webinarIngestService: WebinarIngestService,
  ) {}

  async executeList(query: ListWebinarLeadsQueryDto): Promise<WebinarLeadsListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (query.webinarEventId != null && query.webinarEventId.trim() !== '') {
      if (!Types.ObjectId.isValid(query.webinarEventId)) {
        throw new BadRequestException('Invalid webinarEventId');
      }
      filter.webinarEventId = new Types.ObjectId(query.webinarEventId);
    }
    if (query.status != null) {
      filter.status = query.status;
    }
    if (query.phone != null && query.phone.trim() !== '') {
      const canonical = normalizeCustomerPhone(query.phone);
      filter.phone = canonical;
    }
    const [items, total] = await Promise.all([
      this.webinarLeadModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.webinarLeadModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit };
  }

  async executeGetById(leadId: string): Promise<WebinarLeadDocument> {
    if (!Types.ObjectId.isValid(leadId)) {
      throw new BadRequestException('Invalid webinar lead id');
    }
    const lead = await this.webinarLeadModel.findById(leadId).exec();
    if (lead == null) {
      throw new NotFoundException(`Webinar lead ${leadId} was not found`);
    }
    return lead;
  }

  /**
   * Creates a lead manually for a webinar event and optionally sends WhatsApp template.
   */
  async executeCreate(dto: CreateWebinarLeadDto): Promise<WebinarLeadDocument> {
    const event = await this.executeGetEventOrThrow(dto.webinarEventId);
    const result = await this.executeCreateOneLead({
      event,
      item: {
        name: dto.name,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
      },
      sendNotification: dto.sendNotification !== false,
      formName: 'manual_admin',
      metaLeadgenPrefix: 'manual',
    });
    if (result.status === 'already_exists') {
      throw new ConflictException(
        `A lead with phone ${result.phone} already exists for this webinar`,
      );
    }
    if (result.status === 'error') {
      throw new BadRequestException(result.message);
    }
    return this.executeGetById(result.leadId);
  }

  /**
   * Bulk import leads for a webinar; sends WhatsApp template per newly created lead when enabled.
   */
  async executeImport(dto: ImportWebinarLeadsDto): Promise<ImportWebinarLeadsResponse> {
    const event = await this.executeGetEventOrThrow(dto.webinarEventId);
    const sendNotification = dto.sendNotification !== false;
    const results: ImportWebinarLeadResultItem[] = [];
    const seenPhones = new Set<string>();
    for (const item of dto.leads) {
      const canonicalPhone = normalizeCustomerPhone(item.phone);
      if (canonicalPhone.length === 0) {
        results.push({
          phone: item.phone ?? '',
          status: 'error',
          message: 'Phone is required',
        });
        continue;
      }
      if (seenPhones.has(canonicalPhone)) {
        results.push({
          phone: canonicalPhone,
          status: 'error',
          message: 'Duplicate phone in import file',
        });
        continue;
      }
      seenPhones.add(canonicalPhone);
      const rowResult = await this.executeCreateOneLead({
        event,
        item: { ...item, phone: canonicalPhone },
        sendNotification,
        formName: 'import_admin',
        metaLeadgenPrefix: 'import',
      });
      results.push(rowResult);
    }
    const created = results.filter((r) => r.status === 'created').length;
    const alreadyExists = results.filter((r) => r.status === 'already_exists').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const notificationsSent = results.filter(
      (r) => r.status === 'created' && r.notificationSent,
    ).length;
    this.logger.log(
      `Webinar import event=${dto.webinarEventId} created=${created} alreadyExists=${alreadyExists} errors=${errors} notificationsSent=${notificationsSent}`,
    );
    return { results, created, alreadyExists, errors, notificationsSent };
  }

  /**
   * Permanently removes a webinar lead from the list (does not delete linked Customer).
   */
  async executeDelete(
    leadId: string,
  ): Promise<{ readonly deleted: true; readonly id: string }> {
    const lead = await this.executeGetById(leadId);
    await this.webinarLeadModel.deleteOne({ _id: lead._id }).exec();
    this.logger.log(`Deleted webinar lead ${leadId} phone=${lead.phone}`);
    return { deleted: true, id: leadId };
  }

  /**
   * Converts a webinar lead into a Customer (or links existing). Idempotent when already converted.
   */
  async executeConvert(leadId: string, actorUserId: string): Promise<WebinarLeadDocument> {
    const lead = await this.executeGetById(leadId);
    if (lead.status === WebinarLeadStatus.Converted && lead.convertedCustomerId != null) {
      return lead;
    }
    let customerId = lead.customerId ?? null;
    if (customerId == null) {
      const existing = await findCustomerByPhoneCandidates(this.customerModel, lead.phone);
      if (existing != null) {
        customerId = existing._id as Types.ObjectId;
      } else {
        const created = await this.customerService.createCustomer(
          {
            name: lead.name.trim() || 'Lead',
            lastName: lead.lastName?.trim() ?? '',
            phone: lead.phone,
            whatsapp: lead.phone,
            email: lead.email?.trim() ? lead.email.trim() : undefined,
          },
          actorUserId.length > 0 ? actorUserId : WEBINAR_INGEST_ACTOR_ID,
        );
        customerId = created._id as Types.ObjectId;
        this.logger.log(
          `Converted webinar lead ${leadId} created customer ${String(customerId)}`,
        );
      }
    }
    lead.customerId = customerId;
    lead.convertedCustomerId = customerId;
    lead.convertedAt = new Date();
    lead.status = WebinarLeadStatus.Converted;
    await lead.save();
    return lead;
  }

  private async executeGetEventOrThrow(webinarEventId: string): Promise<WebinarEventDocument> {
    if (!Types.ObjectId.isValid(webinarEventId)) {
      throw new BadRequestException('Invalid webinarEventId');
    }
    const event = await this.webinarEventModel.findById(webinarEventId).exec();
    if (event == null) {
      throw new NotFoundException(`Webinar event ${webinarEventId} was not found`);
    }
    return event;
  }

  private async executeCreateOneLead(input: {
    readonly event: WebinarEventDocument;
    readonly item: CreateWebinarLeadItemDto;
    readonly sendNotification: boolean;
    readonly formName: string;
    readonly metaLeadgenPrefix: string;
  }): Promise<ImportWebinarLeadResultItem> {
    const { event, item, sendNotification, formName, metaLeadgenPrefix } = input;
    const canonicalPhone = normalizeCustomerPhone(item.phone);
    if (canonicalPhone.length === 0) {
      return { phone: item.phone ?? '', status: 'error', message: 'Phone is required' };
    }
    const name = item.name?.trim() ?? '';
    if (name.length === 0) {
      return { phone: canonicalPhone, status: 'error', message: 'Name is required' };
    }
    try {
      const existingLead = await this.webinarLeadModel
        .findOne({
          webinarEventId: event._id,
          phone: canonicalPhone,
        })
        .exec();
      if (existingLead != null) {
        return {
          phone: canonicalPhone,
          status: 'already_exists',
          leadId: String(existingLead._id),
        };
      }
      const existingCustomer = await findCustomerByPhoneCandidates(
        this.customerModel,
        canonicalPhone,
      );
      const lead = await this.webinarLeadModel.create({
        name,
        lastName: item.lastName?.trim() ?? '',
        email: item.email?.trim() ?? '',
        phone: canonicalPhone,
        metaLeadgenId: `${metaLeadgenPrefix}:${randomUUID()}`,
        formName,
        mappedFields: {},
        webinarEventId: event._id,
        customerId: existingCustomer?._id ?? null,
        status: WebinarLeadStatus.Registered,
      });
      let notificationSent = false;
      if (sendNotification) {
        const meetLink = event.meetLink?.trim() ?? '';
        if (meetLink.length === 0) {
          lead.notificationError = 'Webinar has no Google Meet link; skipped WhatsApp';
          await lead.save();
        } else {
          await this.webinarIngestService.executeSendRegistrationNotification(lead, event);
          const refreshed = await this.webinarLeadModel.findById(lead._id).exec();
          notificationSent = refreshed?.notificationSentAt != null;
        }
      }
      return {
        phone: canonicalPhone,
        status: 'created',
        leadId: String(lead._id),
        notificationSent,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error during import';
      this.logger.warn(`Create webinar lead failed phone=${canonicalPhone}: ${message}`);
      return { phone: canonicalPhone, status: 'error', message };
    }
  }
}
