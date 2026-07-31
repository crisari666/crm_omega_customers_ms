import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerConversationsService } from '../customer-conversations/customer-conversations.service';
import { normalizeCustomerPhone } from './utils/normalize-customer-phone.util';
import { resolveCustomerWaIdFromMetaWebhookValue } from './utils/resolve-customer-wa-id-from-meta-webhook-value.util';
import { MetaWebhookMessagesValue } from './types/meta-webhook-messages-value.type';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { CustomerService } from './customer.service';
import { CustomerPotentialCustomersOutboundService } from './customer-potential-customers-outbound.service';
import { CustomerVentorAssignmentService } from './customer-ventor-assignment.service';
import { CustomerWhatsappFlowCompletedService } from './customer-whatsapp-flow-completed.service';
import { WhatsappMarketingRecoveryReplyService } from '../whatsapp-marketing/whatsapp-marketing-recovery-reply.service';
import { WhatsappMarketingStatusService } from '../whatsapp-marketing/whatsapp-marketing-status.service';
import { CustomerMetaInboundReplyService } from './customer-meta-inbound-reply.service';

type WebhookForwardEnvelope = {
  readonly source?: string;
  readonly receivedAt?: string;
  readonly payload?: unknown;
};

/**
 * Ingests Meta WhatsApp webhooks from omega_gateway only (Meta does not POST to whatsapp_cloud_ms).
 * Handles marketing campaign replies/statuses, resolve/create {@link Customer},
 * upsert WhatsApp chat/message, optionally request `potential_customer` template.
 */
@Injectable()
export class CustomerMetaWebhookService {
  private readonly logger: Logger = new Logger(CustomerMetaWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    private readonly customerService: CustomerService,
    private readonly customerConversationsService: CustomerConversationsService,
    private readonly potentialCustomersOutbound: CustomerPotentialCustomersOutboundService,
    private readonly ventorAssignment: CustomerVentorAssignmentService,
    private readonly flowCompletedService: CustomerWhatsappFlowCompletedService,
    @Inject(forwardRef(() => WhatsappMarketingRecoveryReplyService))
    private readonly marketingRecoveryReply: WhatsappMarketingRecoveryReplyService,
    @Inject(forwardRef(() => WhatsappMarketingStatusService))
    private readonly marketingStatusService: WhatsappMarketingStatusService,
    private readonly inboundReplyService: CustomerMetaInboundReplyService,
  ) {}

  /**
   * Parses {@link WebhookForwardEnvelope} or raw Meta payload and processes `messages` changes.
   */
  async executeProcessMetaIngress(body: unknown): Promise<void> {
    const metaRoot: unknown = this.unwrapMetaPayload(body);
    if (metaRoot == null || typeof metaRoot !== 'object') {
      return;
    }
    const entries = (metaRoot as Record<string, unknown>).entry;
    if (!Array.isArray(entries)) {
      return;
    }
    for (const entry of entries) {
      if (entry == null || typeof entry !== 'object') {
        continue;
      }
      const changes = (entry as Record<string, unknown>).changes;
      if (!Array.isArray(changes)) {
        continue;
      }
      for (const change of changes) {
        if (change == null || typeof change !== 'object') {
          continue;
        }
        const field = (change as Record<string, unknown>).field;
        if (field !== 'messages') {
          continue;
        }
        const value = (change as Record<string, unknown>).value as MetaWebhookMessagesValue | undefined;
        if (value == null) {
          continue;
        }
        await this.executeProcessMessagesValue(value);
      }
    }
  }

  private unwrapMetaPayload(body: unknown): unknown {
    if (body == null || typeof body !== 'object') {
      return body;
    }
    const envelope = body as WebhookForwardEnvelope;
    if (envelope.payload != null && typeof envelope.payload === 'object') {
      return envelope.payload;
    }
    return body;
  }

  private async executeProcessMessagesValue(value: MetaWebhookMessagesValue): Promise<void> {
    const phoneNumberId: string = value.metadata.phone_number_id.trim();
    const messages = value.messages ?? [];
    const statuses = value.statuses ?? [];
    if (messages.length === 0 && statuses.length === 0) {
      return;
    }
    await this.executeProcessMarketingMessageStatuses(statuses);
    if (messages.length === 0) {
      return;
    }
    const contacts = value.contacts ?? [];
    const actorId: string = this.configService.get<string>('customersMetaIngest.actorUserId', 'meta-gateway-ingest');
    for (const msg of messages) {
      const normalizedWaId: string = resolveCustomerWaIdFromMetaWebhookValue(value, msg, 'message');
      const sessionId: string = `cloud:${phoneNumberId}:${normalizedWaId}`;
      const contactName: string = this.resolveContactName(contacts, normalizedWaId);
      const marketingReplyHandled = await this.executeTryMarketingCampaignReply({
        msg,
        normalizedWaId,
        contactName,
        phoneNumberId,
      });
      if (marketingReplyHandled) {
        continue;
      }
      let customer = await this.findCustomerByWaCandidates(normalizedWaId);
      let created = false;
      if (!customer) {
        const split = this.splitProfileName(contactName);
        const doc = await this.customerService.createCustomer(
          { name: split.name, lastName: split.lastName, phone: normalizedWaId, whatsapp: normalizedWaId },
          actorId,
        );
        await this.customerModel.updateOne(
          { _id: doc._id },
          { $set: { whatsappPotentialCustomerStatus: 'pending_flow' } },
        );
        customer = (await this.customerModel.findById(doc._id).exec())!;
        created = true;
      }
      await this.executePersistMetaClickIdFromReferral(customer, msg);
      const assignmentWindowHours = this.ventorAssignment.getGatewayIngressAssignmentWindowHours();
      await this.ventorAssignment.executeAssignCustomerIfUnassigned({
        customer,
        windowHours: assignmentWindowHours,
        actorUserId: actorId,
      });
      await this.customerConversationsService.executeUpsertFromMetaIngress({
        sessionId,
        chatId: normalizedWaId,
        customerId: customer._id as Types.ObjectId,
        contactName,
        crmMessage: true,
        message: {
          messageId: msg.id,
          fromMe: false,
          body: this.extractInboundBody(msg),
          type: msg.type,
          timestamp: Number.parseInt(msg.timestamp, 10),
          hasMedia: false,
          mediaType: null,
          mediaPath: null,
          mediaMimeType: null,
          mediaFilename: null,
        },
      });
      const flowResponse: unknown | null = this.extractNfmReplyFlowResponse(msg);
      if (flowResponse != null) {
        await this.flowCompletedService.executeProcessFlowCompleted({
          waId: normalizedWaId,
          phoneNumberId,
          flowResponse,
          rawMessageId: msg.id,
        });
        continue;
      }
      const funnelStatus = customer.whatsappPotentialCustomerStatus ?? 'none';
      const shouldSendTemplate: boolean =
        (created || funnelStatus === 'pending_flow') &&
        customer.metaPotentialTemplateSent !== true &&
        funnelStatus !== 'ready_for_llm';
      if (!shouldSendTemplate) {
        await this.inboundReplyService.executeTrySendAssignedVentorContactReply({
          customer,
          normalizedWaId,
          phoneNumberId,
          contactName,
          msg,
        });
        continue;
      }
      await this.customerModel.updateOne(
        { _id: customer._id },
        { $set: { metaPotentialTemplateSent: true, whatsappPotentialCustomerStatus: 'pending_flow' } },
      );
      await this.potentialCustomersOutbound.executeEmitPotentialCustomersEvent({
        type: 'potential_customers',
        payload: {
          action: 'send.potential_customer_template',
          waId: normalizedWaId,
          phoneNumberId,
          contactName,
          customerId: String(customer._id),
        },
      });
    }
  }

  private splitProfileName(full: string): { name: string; lastName: string } {
    const trimmed: string = full.trim();
    if (trimmed === '') {
      return { name: 'Contacto', lastName: '' };
    }
    const parts: string[] = trimmed.split(/\s+/u);
    if (parts.length === 1) {
      return { name: parts[0], lastName: '' };
    }
    return { name: parts[0], lastName: parts.slice(1).join(' ') };
  }

  /**
   * Persists `referral.ctwa_clid` on the customer when present (refresh when newer value arrives).
   */
  private async executePersistMetaClickIdFromReferral(
    customer: CustomerDocument,
    msg: NonNullable<MetaWebhookMessagesValue['messages']>[number],
  ): Promise<void> {
    const ctwaClid =
      typeof msg.referral?.ctwa_clid === 'string' ? msg.referral.ctwa_clid.trim() : '';
    if (ctwaClid.length === 0) {
      return;
    }
    if (customer.metaCtwaClid === ctwaClid) {
      return;
    }
    await this.customerModel.updateOne(
      { _id: customer._id },
      { $set: { metaCtwaClid: ctwaClid } },
    );
    customer.metaCtwaClid = ctwaClid;
  }

  private extractNfmReplyFlowResponse(
    msg: NonNullable<MetaWebhookMessagesValue['messages']>[number],
  ): unknown | null {
    if (msg.type !== 'interactive' || msg.interactive?.type !== 'nfm_reply') {
      return null;
    }
    return msg.interactive.nfm_reply?.response_json ?? null;
  }

  /** Delivery/read/failed updates for outbound marketing templates (gateway ingress). */
  private async executeProcessMarketingMessageStatuses(
    statuses: NonNullable<MetaWebhookMessagesValue['statuses']>,
  ): Promise<void> {
    for (const status of statuses) {
      const messageId = status.id.trim();
      if (messageId.length === 0) {
        continue;
      }
      const normalizedStatus = status.status.trim().toLowerCase();
      if (
        normalizedStatus !== 'sent' &&
        normalizedStatus !== 'delivered' &&
        normalizedStatus !== 'read' &&
        normalizedStatus !== 'failed'
      ) {
        continue;
      }
      const statusRecord = status as {
        errors?: Array<{ code?: number; title?: string }>;
      };
      const firstError = statusRecord.errors?.[0];
      await this.marketingStatusService.executeApplyMessageStatus({
        whatsappMessageId: messageId,
        status: normalizedStatus,
        timestamp: status.timestamp,
        errorCode:
          firstError != null && typeof firstError.code === 'number'
            ? String(firstError.code)
            : undefined,
        errorMessage:
          firstError != null && typeof firstError.title === 'string'
            ? firstError.title
            : undefined,
      });
    }
  }

  private async executeTryMarketingCampaignReply(input: {
    msg: NonNullable<MetaWebhookMessagesValue['messages']>[number];
    normalizedWaId: string;
    contactName: string;
    phoneNumberId: string;
  }): Promise<boolean> {
    const contextId =
      typeof input.msg.context?.id === 'string' ? input.msg.context.id.trim() : '';
    if (contextId.length === 0) {
      return false;
    }
    if (input.msg.type !== 'button' && input.msg.type !== 'text') {
      return false;
    }
    const timestamp = Number.parseInt(input.msg.timestamp, 10);
    const result = await this.marketingRecoveryReply.executeHandleMarketingReply({
      contextMessageId: contextId,
      waId: input.normalizedWaId,
      messageType: input.msg.type,
      buttonPayload: input.msg.button?.payload,
      textBody: input.msg.text?.body,
      rawMessageId: input.msg.id,
      timestamp: Number.isFinite(timestamp) ? timestamp : Math.floor(Date.now() / 1000),
      contactName: input.contactName,
      phoneNumberId: input.phoneNumberId,
    });
    return result.handled;
  }

  private extractInboundBody(msg: NonNullable<MetaWebhookMessagesValue['messages']>[number]): string {
    if (msg.type === 'text') {
      return msg.text?.body ?? '';
    }
    if (msg.type === 'button') {
      return msg.button?.text ?? '';
    }
    if (msg.type === 'interactive') {
      return msg.interactive?.nfm_reply?.body ?? '';
    }
    return '';
  }

  private resolveContactName(
    contacts: NonNullable<MetaWebhookMessagesValue['contacts']>,
    normalizedWaId: string,
  ): string {
    for (const contact of contacts) {
      if (normalizeCustomerPhone(contact.wa_id) !== normalizedWaId) {
        continue;
      }
      const name: string | undefined = contact.profile?.name?.trim();
      if (name != null && name.length > 0) {
        return name;
      }
    }
    return '';
  }

  private async findCustomerByWaCandidates(normalizedWaId: string): Promise<CustomerDocument | null> {
    const digits: string = normalizedWaId.replace(/\D/g, '');
    const candidates: string[] = [normalizedWaId, digits].filter((v, i, a) => v !== '' && a.indexOf(v) === i);
    if (candidates.length === 0) {
      return null;
    }
    return this.customerModel
      .findOne({
        $or: [{ phone: { $in: candidates } }, { whatsapp: { $in: candidates } }],
      })
      .exec();
  }
}
