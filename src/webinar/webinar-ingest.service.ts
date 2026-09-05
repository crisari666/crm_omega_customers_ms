import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { MetaLeadgenIngestEnvelope } from '../customer/types/meta-leadgen-ingest-envelope.type';
import { findCustomerByPhoneCandidates } from '../customer/utils/find-customer-by-phone-candidates.util';
import { normalizeCustomerPhone } from '../customer/utils/normalize-customer-phone.util';
import type { MarketingCampaignMsEvent } from '../whatsapp-marketing/types/marketing-campaign-ms-event.type';
import {
  WEBINAR_REGISTRATION_TEMPLATE_LANGUAGE,
  WEBINAR_REGISTRATION_TEMPLATE_NAME,
} from './constants/webinar-notification.constants';
import {
  WebinarEvent,
  WebinarEventDocument,
  WebinarEventStatus,
} from './schemas/webinar-event.schema';
import {
  WebinarLead,
  WebinarLeadDocument,
  WebinarLeadStatus,
} from './schemas/webinar-lead.schema';
import { buildWebinarRegistrationTemplateComponents } from './utils/build-webinar-registration-template-components.util';
import { WebinarOutboundService } from './webinar-outbound.service';

/**
 * Ingests Formulario_MasterClass Lead Ads from omega_gateway.
 */
@Injectable()
export class WebinarIngestService {
  private readonly logger = new Logger(WebinarIngestService.name);

  constructor(
    @InjectModel(WebinarLead.name)
    private readonly webinarLeadModel: Model<WebinarLeadDocument>,
    @InjectModel(WebinarEvent.name)
    private readonly webinarEventModel: Model<WebinarEventDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly outboundService: WebinarOutboundService,
  ) {}

  async executeProcessWebinarLeadIngress(payload: unknown): Promise<void> {
    const envelope = this.parseEnvelope(payload);
    if (envelope == null) {
      this.logger.warn('customers.meta.webinar_lead.ingest.v1: invalid envelope');
      return;
    }
    const leadgenId = envelope.leadgenId.trim();
    if (leadgenId.length === 0) {
      return;
    }
    this.logger.log(
      `webinar ingest start leadgenId=${leadgenId} form=${envelope.graph.form?.name ?? ''} phoneDigitsLen=${envelope.contact.phoneDigits.replace(/\D/g, '').length}`,
    );
    const phoneDigits = envelope.contact.phoneDigits.replace(/\D/g, '');
    const canonicalPhone = normalizeCustomerPhone(phoneDigits);
    if (canonicalPhone.length === 0) {
      this.logger.warn(`webinar leadgenId=${leadgenId}: no usable phone`);
      return;
    }
    const activeEvent = await this.webinarEventModel
      .findOne({ status: WebinarEventStatus.Active })
      .sort({ scheduledAt: -1, createdAt: -1 })
      .exec();
    this.logger.log(
      `webinar ingest activeEvent=${activeEvent != null ? String(activeEvent._id) : 'none'} meetLink=${activeEvent?.meetLink?.trim() ? 'yes' : 'no'}`,
    );
    const existingCustomer = await findCustomerByPhoneCandidates(
      this.customerModel,
      canonicalPhone,
    );
    const lead = await this.upsertLeadFromEnvelope({
      envelope,
      leadgenId,
      canonicalPhone,
      activeEvent,
      customerId: existingCustomer?._id as Types.ObjectId | undefined,
    });
    this.logger.log(
      `webinar lead upserted id=${String(lead._id)} phone=${canonicalPhone} customerId=${lead.customerId != null ? String(lead.customerId) : 'none'} notified=${lead.notificationSentAt != null}`,
    );
    if (lead.notificationSentAt != null) {
      this.logger.log(
        `webinar template skip already-sent lead=${String(lead._id)} messageId=${lead.whatsappMessageId ?? ''}`,
      );
      return;
    }
    if (activeEvent == null) {
      lead.notificationError = 'No active webinar event; skipped WhatsApp notification';
      await lead.save();
      this.logger.warn(`leadgenId=${leadgenId}: no active webinar event`);
      return;
    }
    const meetLink = activeEvent.meetLink?.trim() ?? '';
    if (meetLink.length === 0) {
      lead.notificationError = 'Active webinar has no Google Meet link; skipped WhatsApp';
      await lead.save();
      this.logger.warn(`leadgenId=${leadgenId}: active webinar missing meetLink`);
      return;
    }
    await this.executeSendRegistrationNotification(lead, activeEvent);
  }

  private async upsertLeadFromEnvelope(input: {
    readonly envelope: MetaLeadgenIngestEnvelope;
    readonly leadgenId: string;
    readonly canonicalPhone: string;
    readonly activeEvent: WebinarEventDocument | null;
    readonly customerId?: Types.ObjectId;
  }): Promise<WebinarLeadDocument> {
    const { envelope, leadgenId, canonicalPhone, activeEvent, customerId } = input;
    const formName = envelope.graph.form?.name;
    const webhook = envelope.webhookValue;
    const rawWebhookValue: Record<string, unknown> | undefined =
      webhook != null ? { ...webhook } : undefined;
    const fieldData = (envelope.graph.fieldData ?? []).map((row) => ({
      name: row.name,
      values: [...(row.values ?? [])],
    }));
    const campaignName =
      envelope.graph.campaignName?.trim() ||
      envelope.mappedFields.campaign_name?.trim() ||
      undefined;
    const setFields: Record<string, unknown> = {
      name: envelope.contact.name.trim() || 'Lead',
      lastName: envelope.contact.lastName.trim(),
      email: envelope.contact.email.trim(),
      phone: canonicalPhone,
      formName,
      mappedFields: envelope.mappedFields ?? {},
      fieldData,
      rawWebhookValue,
      pageId: webhook?.page_id,
      formId: webhook?.form_id ?? envelope.graph.formId,
      adId: envelope.graph.adId ?? webhook?.ad_id,
      platform: envelope.graph.platform,
      campaignName: campaignName != null && campaignName.length > 0 ? campaignName : undefined,
      graphCreatedTime: envelope.graph.createdTime,
      gatewayReceivedAt: envelope.receivedAt,
      webinarEventId: activeEvent?._id ?? null,
    };
    if (customerId != null) {
      setFields.customerId = customerId;
    }
    this.logger.log(
      `webinar lead persist leadgenId=${leadgenId} mappedFieldKeys=${Object.keys(envelope.mappedFields ?? {}).length} fieldDataRows=${fieldData.length}`,
    );
    await this.webinarLeadModel.updateOne(
      { metaLeadgenId: leadgenId },
      {
        $set: setFields,
        $setOnInsert: {
          metaLeadgenId: leadgenId,
          status: WebinarLeadStatus.Registered,
        },
      },
      { upsert: true },
    );
    const lead = await this.webinarLeadModel.findOne({ metaLeadgenId: leadgenId }).exec();
    if (lead == null) {
      throw new Error(`Failed to upsert webinar lead leadgenId=${leadgenId}`);
    }
    return lead;
  }

  /**
   * Sends WhatsApp registration template for a lead against a webinar event.
   */
  async executeSendRegistrationNotification(
    lead: WebinarLeadDocument,
    event: WebinarEventDocument,
  ): Promise<void> {
    const components = buildWebinarRegistrationTemplateComponents({
      dayLabel: event.dayLabel,
      dateText: event.dateText,
      timeText: event.timeText,
      meetLink: event.meetLink,
    });
    const msEvent: MarketingCampaignMsEvent = {
      type: 'marketing_campaign',
      payload: {
        action: 'send.marketing_template',
        campaignRecipientId: String(lead._id),
        to: lead.phone,
        templateName: WEBINAR_REGISTRATION_TEMPLATE_NAME,
        languageCode: WEBINAR_REGISTRATION_TEMPLATE_LANGUAGE,
        components,
      },
    };
    this.logger.log(
      `webinar template send start template=${WEBINAR_REGISTRATION_TEMPLATE_NAME} lang=${WEBINAR_REGISTRATION_TEMPLATE_LANGUAGE} to=${lead.phone} lead=${String(lead._id)} event=${String(event._id)} day=${event.dayLabel} date=${event.dateText} time=${event.timeText} meet=${event.meetLink}`,
    );
    this.logger.log(`webinar template components=${JSON.stringify(components)}`);
    const response = await this.outboundService.executeSendRegistrationTemplate(msEvent);
    if (!response.success || response.messageId == null || response.messageId.trim() === '') {
      lead.notificationError = response.message ?? 'send failed';
      await lead.save();
      this.logger.warn(
        `webinar template send FAILED lead=${String(lead._id)} to=${lead.phone} error=${lead.notificationError}`,
      );
      return;
    }
    lead.notificationSentAt = new Date();
    lead.whatsappMessageId = response.messageId;
    lead.notificationError = undefined;
    await lead.save();
    this.logger.log(
      `webinar template send OK lead=${String(lead._id)} to=${lead.phone} template=${WEBINAR_REGISTRATION_TEMPLATE_NAME} messageId=${response.messageId}`,
    );
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
      receivedAt:
        typeof record.receivedAt === 'string' ? record.receivedAt : new Date().toISOString(),
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
        phoneDigits:
          typeof contactRecord.phoneDigits === 'string' ? contactRecord.phoneDigits : '',
      },
    };
  }
}
