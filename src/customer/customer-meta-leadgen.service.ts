import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerService } from './customer.service';
import { CustomerVentorAssignmentService } from './customer-ventor-assignment.service';
import {
  MetaLeadCampaign,
  MetaLeadCampaignDocument,
  MetaLeadCampaignStatus,
} from './schemas/meta-lead-campaign.schema';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { MetaLeadgenIngestEnvelope } from './types/meta-leadgen-ingest-envelope.type';
import { normalizeCustomerPhone } from './utils/normalize-customer-phone.util';
import { findCustomerByPhoneCandidates } from './utils/find-customer-by-phone-candidates.util';
import { buildMetaLeadMappedFieldItems } from './utils/format-meta-lead-field-label.util';
import type { CustomerMetaLeadMappedFieldsResponse } from './types/customer-meta-lead-mapped-fields.type';

const META_LEADGEN_ACTOR_ID = 'meta-leadgen-ingest';

/**
 * Ingests Meta Lead Ads campaign leads from omega_gateway (`customers.meta.leadgen.ingest.v1`).
 */
@Injectable()
export class CustomerMetaLeadgenService {
  private readonly logger = new Logger(CustomerMetaLeadgenService.name);

  constructor(
    @InjectModel(MetaLeadCampaign.name)
    private readonly metaLeadCampaignModel: Model<MetaLeadCampaignDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly customerService: CustomerService,
    private readonly ventorAssignment: CustomerVentorAssignmentService,
  ) {}

  /**
   * Returns humanized Meta lead form fields linked to a customer (latest campaign).
   */
  async getMappedFieldsForCustomer(customerId: string): Promise<CustomerMetaLeadMappedFieldsResponse> {
    const customerExists = await this.customerModel
      .findById(customerId)
      .select('_id')
      .lean()
      .exec();
    if (customerExists == null) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
    const campaign = await this.metaLeadCampaignModel
      .findOne({ customerId: new Types.ObjectId(customerId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    if (campaign == null) {
      return { hasLead: false, items: [] };
    }
    const mappedFields =
      campaign.mappedFields != null && typeof campaign.mappedFields === 'object'
        ? (campaign.mappedFields as Record<string, string>)
        : {};
    const items = buildMetaLeadMappedFieldItems(mappedFields);
    if (items.length === 0) {
      return { hasLead: false, items: [] };
    }
    return {
      hasLead: true,
      leadgenId: campaign.leadgenId,
      items,
    };
  }

  async executeProcessLeadgenIngress(payload: unknown): Promise<void> {
    const envelope = this.parseEnvelope(payload);
    if (envelope == null) {
      this.logger.warn('customers.meta.leadgen.ingest.v1: invalid envelope');
      return;
    }
    const leadgenId = envelope.leadgenId.trim();
    if (leadgenId.length === 0) {
      return;
    }
    await this.upsertCampaignFromEnvelope(envelope);
    const phoneDigits = envelope.contact.phoneDigits.replace(/\D/g, '');
    const canonicalPhone = normalizeCustomerPhone(phoneDigits);
    if (canonicalPhone.length === 0) {
      await this.metaLeadCampaignModel.updateOne(
        { leadgenId },
        {
          $set: {
            status: MetaLeadCampaignStatus.Failed,
            lastError: 'No phone number in lead field_data',
          },
        },
      );
      this.logger.warn(`leadgenId=${leadgenId}: no usable phone`);
      return;
    }
    let customer = await findCustomerByPhoneCandidates(
      this.customerModel,
      canonicalPhone,
    );
    if (customer == null) {
      const name = envelope.contact.name.trim() || 'Lead';
      const lastName = envelope.contact.lastName.trim();
      const email =
        envelope.contact.email.trim().length > 0 ? envelope.contact.email.trim() : undefined;
      customer = await this.customerService.createCustomer(
        {
          name,
          lastName,
          phone: canonicalPhone,
          whatsapp: canonicalPhone,
          email,
        },
        META_LEADGEN_ACTOR_ID,
      );
      this.logger.log(`Created customer ${String(customer._id)} from leadgenId=${leadgenId}`);
    } else {
      this.logger.log(`Linked existing customer ${String(customer._id)} for leadgenId=${leadgenId}`);
    }
    const windowHours = this.ventorAssignment.getGatewayIngressAssignmentWindowHours();
    await this.ventorAssignment.executeAssignCustomerIfUnassigned({
      customer,
      windowHours,
      actorUserId: META_LEADGEN_ACTOR_ID,
    });
    await this.metaLeadCampaignModel.updateOne(
      { leadgenId },
      {
        $set: {
          customerId: customer._id as Types.ObjectId,
          status: MetaLeadCampaignStatus.Processed,
          lastError: undefined,
        },
      },
    );
    await this.executePersistMetaLeadAttribution(customer, leadgenId, envelope.mappedFields);
  }

  /**
   * Denormalizes Meta leadgen id and optional fbclid onto the customer for CAPI matching.
   */
  private async executePersistMetaLeadAttribution(
    customer: CustomerDocument,
    leadgenId: string,
    mappedFields: Record<string, string>,
  ): Promise<void> {
    const setFields: Record<string, string> = { metaLeadgenId: leadgenId };
    const fbclid = this.resolveFbclidFromMappedFields(mappedFields);
    if (fbclid.length > 0) {
      setFields.metaFbclid = fbclid;
    }
    await this.customerModel.updateOne({ _id: customer._id }, { $set: setFields });
    customer.metaLeadgenId = leadgenId;
    if (fbclid.length > 0) {
      customer.metaFbclid = fbclid;
    }
  }

  private resolveFbclidFromMappedFields(mappedFields: Record<string, string>): string {
    const keys = Object.keys(mappedFields);
    for (const key of keys) {
      const normalized = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
      if (normalized === 'fbclid' || normalized === 'click_id' || normalized === 'fbc') {
        const value = mappedFields[key]?.trim() ?? '';
        if (value.length > 0) {
          return value;
        }
      }
    }
    return '';
  }

  private parseEnvelope(payload: unknown): MetaLeadgenIngestEnvelope | null {
    if (payload == null || typeof payload !== 'object') {
      return null;
    }
    const record = payload as Record<string, unknown>;
    const leadgenId = typeof record.leadgenId === 'string' ? record.leadgenId : '';
    const mappedFields =
      record.mappedFields != null && typeof record.mappedFields === 'object'
        ? (record.mappedFields as Record<string, string>)
        : {};
    const graph = record.graph;
    const contact = record.contact;
    if (graph == null || typeof graph !== 'object' || contact == null || typeof contact !== 'object') {
      return null;
    }
    const contactRecord = contact as Record<string, unknown>;
    return {
      source: 'ceiba',
      receivedAt: typeof record.receivedAt === 'string' ? record.receivedAt : new Date().toISOString(),
      leadgenId,
      webhookValue:
        record.webhookValue != null && typeof record.webhookValue === 'object'
          ? (record.webhookValue as MetaLeadgenIngestEnvelope['webhookValue'])
          : undefined,
      mappedFields,
      graph: graph as MetaLeadgenIngestEnvelope['graph'],
      contact: {
        name: typeof contactRecord.name === 'string' ? contactRecord.name : 'Lead',
        lastName: typeof contactRecord.lastName === 'string' ? contactRecord.lastName : '',
        email: typeof contactRecord.email === 'string' ? contactRecord.email : '',
        phoneDigits: typeof contactRecord.phoneDigits === 'string' ? contactRecord.phoneDigits : '',
      },
    };
  }

  private async upsertCampaignFromEnvelope(envelope: MetaLeadgenIngestEnvelope): Promise<void> {
    const leadgenId = envelope.leadgenId.trim();
    const form = envelope.graph.form;
    const formSet: Record<string, string> = {};
    if (form != null) {
      if (form.name !== undefined) {
        formSet.graphFormName = form.name;
      }
      if (form.status !== undefined) {
        formSet.graphFormStatus = form.status;
      }
      if (form.locale !== undefined) {
        formSet.graphFormLocale = form.locale;
      }
    }
    const webhook = envelope.webhookValue;
    const rawWebhookValue: Record<string, unknown> | undefined =
      webhook != null ? { ...webhook } : undefined;
    await this.metaLeadCampaignModel.updateOne(
      { leadgenId },
      {
        $set: {
          ingestSource: 'meta_campaign',
          gatewayReceivedAt: envelope.receivedAt,
          mappedFields: envelope.mappedFields,
          fieldData: envelope.graph.fieldData.map((row) => ({
            name: row.name,
            values: [...(row.values ?? [])],
          })),
          graphAdId: envelope.graph.adId,
          graphFormId: envelope.graph.formId,
          graphCreatedTime: envelope.graph.createdTime,
          graphPlatform: envelope.graph.platform,
          pageId: webhook?.page_id,
          formId: webhook?.form_id ?? envelope.graph.formId,
          rawWebhookValue,
          status: MetaLeadCampaignStatus.Pending,
          ...formSet,
        },
        $setOnInsert: { leadgenId },
      },
      { upsert: true },
    );
  }

}
