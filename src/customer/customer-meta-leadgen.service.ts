import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerService } from './customer.service';
import { CustomerVentorAssignmentService } from './customer-ventor-assignment.service';
import { CustomerMarketingTemplateOutboundService } from './customer-marketing-template-outbound.service';
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
import {
  BBQ_ASADO_INGEST_ACTOR_ID,
  BBQ_ASADO_TEMPLATE_LANGUAGE,
  BBQ_ASADO_TEMPLATE_NAME,
} from './constants/bbq-asado-notification.constants';
import { buildBbqAsadoTemplateComponents } from './utils/build-bbq-asado-template-components.util';
import { isBbqAsadoFormName } from './utils/is-bbq-asado-form-name.util';
import type { MarketingCampaignMsEvent } from '../whatsapp-marketing/types/marketing-campaign-ms-event.type';
import { MetaLeadFormLookupService } from '../meta-lead-forms/meta-lead-form-lookup.service';
import { MetaLeadFormQualificationScheduler } from '../meta-lead-forms/meta-lead-form-qualification.scheduler';

const META_LEADGEN_ACTOR_ID = 'meta-leadgen-ingest';

function isLegacyCustomersLeadFormName(formName: string | undefined): boolean {
  const normalized = (formName ?? '').trim().toLowerCase();
  return (
    normalized.startsWith('datos_clientes') || isBbqAsadoFormName(formName)
  );
}

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
    private readonly marketingTemplateOutbound: CustomerMarketingTemplateOutboundService,
    private readonly metaLeadFormLookup: MetaLeadFormLookupService,
    private readonly qualificationScheduler: MetaLeadFormQualificationScheduler,
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
    const formName = envelope.graph.form?.name;
    const registryForm = await this.metaLeadFormLookup.executeFindEnabled({
      formId: envelope.graph.formId ?? envelope.webhookValue?.form_id,
      formName,
    });
    const hasRegistryFlow = registryForm != null;
    const isLegacyForm = isLegacyCustomersLeadFormName(formName);
    if (!hasRegistryFlow && !isLegacyForm) {
      await this.metaLeadCampaignModel.updateOne(
        { leadgenId },
        {
          $set: {
            status: MetaLeadCampaignStatus.Processed,
            lastError:
              'No registry match and form name is not a legacy customers prefix; skipped customer upsert',
          },
        },
      );
      this.logger.warn(
        `leadgenId=${leadgenId}: no registry match for form "${formName ?? ''}"; skipped customer upsert`,
      );
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
          lifecycleStatus: 'lead',
          leadSources: ['meta_form'],
        },
        META_LEADGEN_ACTOR_ID,
      );
      this.logger.log(`Created customer ${String(customer._id)} from leadgenId=${leadgenId}`);
    } else {
      await this.customerService.tagLeadIngress(customer._id as Types.ObjectId, 'meta_form');
      this.logger.log(`Linked existing customer ${String(customer._id)} for leadgenId=${leadgenId}`);
    }
    if (registryForm?.flowStrategy === 'lead_conversation') {
      await this.executeLeadConversationFormPath({
        leadgenId,
        customer,
        phone: canonicalPhone,
        contactName: envelope.contact.name,
        mappedFields: envelope.mappedFields,
      });
      return;
    }
    if (registryForm?.flowStrategy === 'immediate_assign') {
      await this.executeImmediateAssignFormPath({
        leadgenId,
        customer,
        mappedFields: envelope.mappedFields,
      });
      return;
    }
    await this.executeHardcodedLegacyPath({
      leadgenId,
      customer,
      canonicalPhone,
      formName,
      contactName: envelope.contact.name,
      mappedFields: envelope.mappedFields,
    });
  }

  /**
   * Registry `lead_conversation`: persist customer without ventor assign; schedule delayed WA nudge.
   */
  private async executeLeadConversationFormPath(input: {
    readonly leadgenId: string;
    readonly customer: CustomerDocument;
    readonly phone: string;
    readonly contactName: string;
    readonly mappedFields: Record<string, string>;
  }): Promise<void> {
    await this.metaLeadCampaignModel.updateOne(
      { leadgenId: input.leadgenId },
      {
        $set: {
          customerId: input.customer._id as Types.ObjectId,
          status: MetaLeadCampaignStatus.Processed,
          lastError: undefined,
        },
      },
    );
    await this.executePersistMetaLeadAttribution(
      input.customer,
      input.leadgenId,
      input.mappedFields,
    );
    await this.qualificationScheduler.executeSchedule({
      leadgenId: input.leadgenId,
      customerId: String(input.customer._id),
      phone: input.phone,
      contactName: input.contactName,
    });
    this.logger.log(
      `Registry lead_conversation: saved customer ${String(input.customer._id)} leadgenId=${input.leadgenId}; delayed outbound scheduled`,
    );
  }

  /**
   * Registry `immediate_assign`: ventor assign without BBQ hardcode; no qualification job.
   */
  private async executeImmediateAssignFormPath(input: {
    readonly leadgenId: string;
    readonly customer: CustomerDocument;
    readonly mappedFields: Record<string, string>;
  }): Promise<void> {
    const windowHours = this.ventorAssignment.getGatewayIngressAssignmentWindowHours();
    await this.ventorAssignment.executeAssignCustomerIfUnassigned({
      customer: input.customer,
      windowHours,
      actorUserId: META_LEADGEN_ACTOR_ID,
    });
    await this.metaLeadCampaignModel.updateOne(
      { leadgenId: input.leadgenId },
      {
        $set: {
          customerId: input.customer._id as Types.ObjectId,
          status: MetaLeadCampaignStatus.Processed,
          lastError: undefined,
        },
      },
    );
    await this.executePersistMetaLeadAttribution(
      input.customer,
      input.leadgenId,
      input.mappedFields,
    );
    this.logger.log(
      `Registry immediate_assign: customer ${String(input.customer._id)} leadgenId=${input.leadgenId}`,
    );
  }

  /**
   * Safety net: existing name-prefix BBQ / assign behavior when no registry match.
   */
  private async executeHardcodedLegacyPath(input: {
    readonly leadgenId: string;
    customer: CustomerDocument;
    readonly canonicalPhone: string;
    readonly formName: string | undefined;
    readonly contactName: string;
    readonly mappedFields: Record<string, string>;
  }): Promise<void> {
    const isBbqAsado = isBbqAsadoFormName(input.formName);
    const windowHours = this.ventorAssignment.getGatewayIngressAssignmentWindowHours();
    const actorUserId = isBbqAsado ? BBQ_ASADO_INGEST_ACTOR_ID : META_LEADGEN_ACTOR_ID;
    if (isBbqAsado) {
      await this.executeEnsureBbqAsadoVentorAssignment({
        customer: input.customer,
        windowHours,
        actorUserId,
      });
      input.customer =
        (await this.customerModel.findById(input.customer._id).exec()) ?? input.customer;
      await this.customerModel.updateOne(
        { _id: input.customer._id },
        { $set: { whatsappPotentialCustomerStatus: 'ready_for_llm' } },
      );
      input.customer.whatsappPotentialCustomerStatus = 'ready_for_llm';
    } else {
      await this.ventorAssignment.executeAssignCustomerIfUnassigned({
        customer: input.customer,
        windowHours,
        actorUserId,
      });
    }
    await this.metaLeadCampaignModel.updateOne(
      { leadgenId: input.leadgenId },
      {
        $set: {
          customerId: input.customer._id as Types.ObjectId,
          status: MetaLeadCampaignStatus.Processed,
          lastError: undefined,
        },
      },
    );
    await this.executePersistMetaLeadAttribution(
      input.customer,
      input.leadgenId,
      input.mappedFields,
    );
    if (isBbqAsado) {
      await this.executeSendBbqAsadoNotification({
        leadgenId: input.leadgenId,
        customer: input.customer,
        contactName: input.contactName,
        phone: input.canonicalPhone,
      });
    }
  }

  /**
   * Assigns a ventor when missing; if already assigned, keeps the same ventor and refreshes assignedDate.
   */
  private async executeEnsureBbqAsadoVentorAssignment(input: {
    readonly customer: CustomerDocument;
    readonly windowHours: number;
    readonly actorUserId: string;
  }): Promise<void> {
    const existingAssignee = (input.customer.assignedTo ?? '').trim();
    if (existingAssignee.length === 0) {
      await this.ventorAssignment.executeAssignCustomerIfUnassigned({
        customer: input.customer,
        windowHours: input.windowHours,
        actorUserId: input.actorUserId,
      });
      return;
    }
    input.customer.assignedDate = new Date().toISOString();
    input.customer.$locals['__auditActorUserId'] = input.actorUserId;
    await input.customer.save();
    this.logger.log(
      `BBQ asado: kept ventor ${existingAssignee} for customer ${String(input.customer._id)}; refreshed assignedDate`,
    );
  }

  /**
   * Sends `bbq_27_sept_notification` once per leadgenId (idempotent).
   */
  private async executeSendBbqAsadoNotification(input: {
    readonly leadgenId: string;
    readonly customer: CustomerDocument;
    readonly contactName: string;
    readonly phone: string;
  }): Promise<void> {
    const campaign = await this.metaLeadCampaignModel.findOne({ leadgenId: input.leadgenId }).exec();
    if (campaign == null) {
      this.logger.warn(`BBQ asado template skip: campaign missing leadgenId=${input.leadgenId}`);
      return;
    }
    if (campaign.notificationSentAt != null) {
      this.logger.log(
        `BBQ asado template skip already-sent leadgenId=${input.leadgenId} messageId=${campaign.whatsappMessageId ?? ''}`,
      );
      return;
    }
    const contactName =
      input.contactName.trim().length > 0
        ? input.contactName.trim()
        : (input.customer.name ?? '').trim() || 'Cliente';
    const components = buildBbqAsadoTemplateComponents(contactName);
    const msEvent: MarketingCampaignMsEvent = {
      type: 'marketing_campaign',
      payload: {
        action: 'send.marketing_template',
        campaignRecipientId: String(campaign._id),
        to: input.phone,
        templateName: BBQ_ASADO_TEMPLATE_NAME,
        languageCode: BBQ_ASADO_TEMPLATE_LANGUAGE,
        components,
      },
    };
    this.logger.log(
      `BBQ asado template send start template=${BBQ_ASADO_TEMPLATE_NAME} lang=${BBQ_ASADO_TEMPLATE_LANGUAGE} to=${input.phone} leadgenId=${input.leadgenId} customerId=${String(input.customer._id)}`,
    );
    const response = await this.marketingTemplateOutbound.executeSendMarketingTemplate(msEvent);
    if (!response.success || response.messageId == null || response.messageId.trim() === '') {
      await this.metaLeadCampaignModel.updateOne(
        { leadgenId: input.leadgenId },
        { $set: { notificationError: response.message ?? 'send failed' } },
      );
      this.logger.warn(
        `BBQ asado template send FAILED leadgenId=${input.leadgenId} to=${input.phone} error=${response.message ?? 'send failed'}`,
      );
      return;
    }
    await this.metaLeadCampaignModel.updateOne(
      { leadgenId: input.leadgenId },
      {
        $set: {
          notificationSentAt: new Date(),
          whatsappMessageId: response.messageId,
          notificationError: undefined,
        },
      },
    );
    this.logger.log(
      `BBQ asado template send OK leadgenId=${input.leadgenId} to=${input.phone} messageId=${response.messageId}`,
    );
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
