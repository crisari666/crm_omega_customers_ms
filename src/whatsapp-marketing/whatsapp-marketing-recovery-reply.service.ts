import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { CustomerConversationsService } from '../customer-conversations/customer-conversations.service';
import { CustomerService } from '../customer/customer.service';
import { CustomerPotentialCustomersOutboundService } from '../customer/customer-potential-customers-outbound.service';
import { CustomerVentorAssignmentService } from '../customer/customer-ventor-assignment.service';
import {
  buildMarketingRecoveryAutoReplyBody,
  resolveMarketingRecoveryAutoReplyKind,
} from '../customer/utils/build-marketing-recovery-auto-reply-body.util';
import { normalizeCustomerPhone } from '../customer/utils/normalize-customer-phone.util';
import { resolveVentorDisplayForCustomer } from '../customer/utils/resolve-ventor-display-for-customer.util';
import {
  WhatsappMarketingCampaign,
  WhatsappMarketingCampaignDocument,
} from './schemas/whatsapp-marketing-campaign.schema';
import {
  WhatsappMarketingCampaignRecipient,
  WhatsappMarketingRecipientDocument,
} from './schemas/whatsapp-marketing-campaign-recipient.schema';
import { WhatsappMarketingDispatchService } from './whatsapp-marketing-dispatch.service';
import type { WhatsappMarketingReplyOutcome } from './schemas/whatsapp-marketing-campaign-recipient.schema';

export type MarketingReplyIngressInput = {
  readonly contextMessageId: string;
  readonly waId: string;
  readonly messageType: 'button' | 'text';
  readonly buttonPayload?: string;
  readonly textBody?: string;
  readonly rawMessageId: string;
  readonly timestamp: number;
  readonly contactName?: string;
  readonly phoneNumberId?: string;
};

export type MarketingReplyHandleResult = {
  readonly handled: boolean;
  readonly skipDefaultAssign: boolean;
};

@Injectable()
export class WhatsappMarketingRecoveryReplyService {
  private readonly logger = new Logger(WhatsappMarketingRecoveryReplyService.name);

  constructor(
    @InjectModel(WhatsappMarketingCampaignRecipient.name)
    private readonly recipientModel: Model<WhatsappMarketingRecipientDocument>,
    @InjectModel(WhatsappMarketingCampaign.name)
    private readonly campaignModel: Model<WhatsappMarketingCampaignDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly customerService: CustomerService,
    private readonly ventorAssignment: CustomerVentorAssignmentService,
    private readonly conversationsService: CustomerConversationsService,
    private readonly dispatchService: WhatsappMarketingDispatchService,
    private readonly potentialCustomersOutbound: CustomerPotentialCustomersOutboundService,
    private readonly configService: ConfigService,
  ) {}

  async executeHandleMarketingReply(
    input: MarketingReplyIngressInput,
  ): Promise<MarketingReplyHandleResult> {
    const contextId = input.contextMessageId.trim();
    if (contextId.length === 0) {
      this.logger.debug('marketing reply: skip — empty contextMessageId');
      return { handled: false, skipDefaultAssign: false };
    }
    this.logger.log(
      `marketing reply: ingress contextMessageId=${contextId} waId=${input.waId} type=${input.messageType} rawMessageId=${input.rawMessageId}`,
    );
    const recipient = await this.recipientModel
      .findOne({ whatsappMessageId: contextId })
      .exec();
    if (recipient == null) {
      this.logger.debug(
        `marketing reply: no campaign recipient for contextMessageId=${contextId}`,
      );
      return { handled: false, skipDefaultAssign: false };
    }
    if (recipient.replyHandledAt != null) {
      this.logger.log(
        `marketing reply: duplicate — recipientId=${String(recipient._id)} already handled at ${recipient.replyHandledAt.toISOString()}`,
      );
      return { handled: true, skipDefaultAssign: true };
    }
    const campaign = await this.campaignModel.findById(recipient.campaignId).exec();
    if (campaign == null) {
      this.logger.warn(
        `marketing reply: campaign missing for recipientId=${String(recipient._id)} campaignId=${String(recipient.campaignId)}`,
      );
      return { handled: false, skipDefaultAssign: false };
    }
    const waId = normalizeCustomerPhone(input.waId);
    const customer = await this.findCustomerByWaCandidates(waId);
    if (customer == null) {
      this.logger.warn(
        `marketing reply: no customer for waId=${waId} recipientId=${String(recipient._id)} campaignId=${String(campaign._id)}`,
      );
      return { handled: false, skipDefaultAssign: false };
    }
    this.logger.log(
      `marketing reply: matched campaign="${campaign.name}" campaignId=${String(campaign._id)} type=${campaign.campaignType} recipientId=${String(recipient._id)} customerId=${String(customer._id)}`,
    );
    const actorId =
      this.configService.get<string>('customersMetaIngest.actorUserId', 'meta-gateway-ingest') ??
      'meta-gateway-ingest';
    let skipDefaultAssign = false;
    let replyOutcome: WhatsappMarketingReplyOutcome = 'reply_logged';
    let didPreserveAssignee = false;
    let didAssignVentor = false;
    if (campaign.campaignType === 'recovery_potential') {
      const preserveStepIds = (campaign.preserveAssigneeCustomerStepIds ?? []).map((id) =>
        String(id),
      );
      const preserveIds = new Set(preserveStepIds);
      const currentStepId =
        customer.customerStepId != null ? String(customer.customerStepId) : '';
      const inPreserveList =
        currentStepId.length > 0 && preserveIds.has(currentStepId);
      this.logger.log(
        `marketing reply: step check customerId=${String(customer._id)} currentStepId=${currentStepId || '(none)'} preserveStepIds=[${preserveStepIds.join(',')}] inPreserveList=${inPreserveList}`,
      );
      const existingAssigneeBefore = (customer.assignedTo ?? '').trim();
      if (inPreserveList) {
        skipDefaultAssign = true;
        didPreserveAssignee = true;
        replyOutcome = 'preserved_assignee';
        this.logger.log(
          `marketing reply: assign decision=keep_same_assignee assignedTo=${existingAssigneeBefore || '(none)'} customerId=${String(customer._id)}`,
        );
      } else {
        if (existingAssigneeBefore.length === 0) {
          const windowHours = this.ventorAssignment.getGatewayIngressAssignmentWindowHours();
          this.logger.log(
            `marketing reply: assign decision=assign_new_ventor customerId=${String(customer._id)} loadBalanceWindowHours=${windowHours}`,
          );
          const assigned = await this.ventorAssignment.executeAssignCustomerIfUnassigned({
            customer,
            windowHours,
            actorUserId: actorId,
          });
          if (assigned != null) {
            didAssignVentor = true;
            replyOutcome = 'assigned_ventor';
            const assignedToAfter = (customer.assignedTo ?? '').trim();
            this.logger.log(
              `marketing reply: ventor assigned customerId=${String(customer._id)} assignedTo=${assignedToAfter}`,
            );
          } else {
            this.logger.warn(
              `marketing reply: ventor assign returned null customerId=${String(customer._id)}`,
            );
          }
        } else {
          const windowHours = this.ventorAssignment.getGatewayIngressAssignmentWindowHours();
          this.logger.log(
            `marketing reply: assign decision=reassign_ventor customerId=${String(customer._id)} previousAssignee=${existingAssigneeBefore} loadBalanceWindowHours=${windowHours}`,
          );
          const reassigned = await this.ventorAssignment.executeReassignCustomerByLoadBalance({
            customer,
            windowHours,
            actorUserId: actorId,
          });
          if (reassigned != null) {
            didAssignVentor = true;
            replyOutcome = 'reassigned_ventor';
            const assignedToAfter = (customer.assignedTo ?? '').trim();
            this.logger.log(
              `marketing reply: ventor reassigned customerId=${String(customer._id)} from=${existingAssigneeBefore} to=${assignedToAfter}`,
            );
          } else {
            this.logger.warn(
              `marketing reply: ventor reassign returned null customerId=${String(customer._id)} previousAssignee=${existingAssigneeBefore}`,
            );
          }
        }
      }
      if (campaign.replyAdvanceToCustomerStepId != null) {
        const advanceToStepId = String(campaign.replyAdvanceToCustomerStepId);
        this.logger.log(
          `marketing reply: advancing step customerId=${String(customer._id)} fromStepId=${currentStepId || '(none)'} toStepId=${advanceToStepId}`,
        );
        await this.customerService.setCustomerStep(
          String(customer._id),
          advanceToStepId,
          actorId,
        );
        replyOutcome = 'step_advanced';
      }
      const phoneNumberIdForReply =
        (input.phoneNumberId ?? '').trim() ||
        (this.configService.get<string>('whatsappMarketing.phoneNumberId', '') ?? '').trim();
      await this.executeSendRecoveryAutoReply({
        waId,
        phoneNumberId: phoneNumberIdForReply,
        customerId: String(customer._id),
        didPreserveAssignee,
        didAssignVentor,
        assignedTo: (customer.assignedTo ?? '').trim(),
      });
    } else {
      this.logger.log(
        `marketing reply: standard campaign — no assign/preserve logic campaignId=${String(campaign._id)} customerId=${String(customer._id)}`,
      );
    }
    const phoneNumberId =
      (input.phoneNumberId ?? '').trim() ||
      (this.configService.get<string>('whatsappMarketing.phoneNumberId', '') ?? '').trim();
    if (phoneNumberId.length > 0) {
      const sessionId = `cloud:${phoneNumberId}:${waId}`;
      const contactName = (input.contactName ?? recipient.customerName).trim();
      const replyBody =
        input.messageType === 'button'
          ? (input.buttonPayload ?? input.textBody ?? 'button')
          : (input.textBody ?? '');
      await this.conversationsService.executeUpsertFromMetaIngress({
        sessionId,
        chatId: waId,
        customerId: customer._id as Types.ObjectId,
        contactName,
        crmMessage: true,
        message: {
          messageId: input.rawMessageId,
          fromMe: false,
          body: replyBody,
          type: input.messageType,
          timestamp: input.timestamp,
          hasMedia: false,
          mediaType: null,
          mediaPath: null,
          mediaMimeType: null,
          mediaFilename: null,
        },
      });
    }
    const now = new Date();
    recipient.repliedAt = now;
    recipient.replyType = input.messageType;
    recipient.replyPayload =
      input.messageType === 'button' ? (input.buttonPayload ?? '') : (input.textBody ?? '');
    recipient.replyHandledAt = now;
    recipient.replyOutcome = replyOutcome;
    recipient.customerStepIdAtReply = customer.customerStepId;
    recipient.status = 'replied';
    recipient.lastStatusAt = now;
    recipient.lastStatusSource = 'webhook';
    recipient.statusHistory.push({
      status: 'replied',
      at: now,
      source: 'webhook',
      detail: replyOutcome,
    });
    await recipient.save();
    await this.dispatchService.executeRecalculateCampaignStats(campaign._id as Types.ObjectId);
    this.logger.log(
      `marketing reply: completed recipientId=${String(recipient._id)} customerId=${String(customer._id)} replyOutcome=${replyOutcome} didPreserveAssignee=${didPreserveAssignee} didAssignVentor=${didAssignVentor} skipDefaultAssign=${skipDefaultAssign}`,
    );
    return { handled: true, skipDefaultAssign };
  }

  private async executeSendRecoveryAutoReply(input: {
    readonly waId: string;
    readonly phoneNumberId: string;
    readonly customerId: string;
    readonly didPreserveAssignee: boolean;
    readonly didAssignVentor: boolean;
    readonly assignedTo: string;
  }): Promise<void> {
    const kind = resolveMarketingRecoveryAutoReplyKind({
      didPreserveAssignee: input.didPreserveAssignee,
      didAssignVentor: input.didAssignVentor,
    });
    if (kind === 'none' || input.waId.trim() === '') {
      this.logger.log(
        `marketing reply: auto-reply skipped kind=${kind} waId=${input.waId} customerId=${input.customerId} didPreserve=${input.didPreserveAssignee} didAssign=${input.didAssignVentor}`,
      );
      return;
    }
    if (input.assignedTo.length === 0) {
      this.logger.warn(
        `marketing reply: auto-reply skipped — no assignedTo customerId=${input.customerId}`,
      );
      return;
    }
    const ventor = await this.ventorAssignment.executeFindVentorById(input.assignedTo);
    if (ventor == null) {
      this.logger.warn(
        `marketing reply: auto-reply skipped — ventor not found assignedTo=${input.assignedTo} customerId=${input.customerId}`,
      );
      return;
    }
    const ventorDisplay = resolveVentorDisplayForCustomer(ventor);
    const body = buildMarketingRecoveryAutoReplyBody({
      kind,
      ventorDisplay,
    });
    if (body == null || body.trim() === '') {
      this.logger.warn(
        `marketing reply: auto-reply skipped — empty body kind=${kind} customerId=${input.customerId}`,
      );
      return;
    }
    this.logger.log(
      `marketing reply: auto-reply emit kind=${kind} customerId=${input.customerId} waId=${input.waId} ventorId=${ventor.id} ventorName=${ventorDisplay.userName} ventorPhone=${ventorDisplay.userPhone}`,
    );
    await this.potentialCustomersOutbound.executeEmitPotentialCustomersEvent({
      type: 'potential_customers',
      payload: {
        action: 'send.potential_customer_text',
        waId: input.waId.trim(),
        phoneNumberId: input.phoneNumberId,
        customerId: input.customerId,
        body,
      },
    });
  }

  private async findCustomerByWaCandidates(waId: string): Promise<CustomerDocument | null> {
    const normalized = normalizeCustomerPhone(waId);
    if (normalized === '') {
      return null;
    }
    return this.customerModel
      .findOne({
        $or: [{ phone: normalized }, { whatsapp: normalized }],
      })
      .exec();
  }
}