import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { CustomerConversationsService } from '../customer-conversations/customer-conversations.service';
import { CustomerDocument } from './schemas/customer.schema';
import { CustomerPotentialCustomersOutboundService } from './customer-potential-customers-outbound.service';
import { CustomerVentorAssignmentService } from './customer-ventor-assignment.service';
import { MetaWebhookMessagesValue } from './types/meta-webhook-messages-value.type';
import { formatVentorAssignmentMessageForCustomer } from './utils/format-ventor-assignment-message.util';
import { resolveVentorDisplayForCustomer } from './utils/resolve-ventor-display-for-customer.util';

type MetaInboundMessage = NonNullable<MetaWebhookMessagesValue['messages']>[number];

export type CustomerMetaInboundReplyInput = {
  readonly customer: CustomerDocument;
  readonly normalizedWaId: string;
  readonly phoneNumberId: string;
  readonly contactName: string;
  readonly msg: MetaInboundMessage;
};

/**
 * Auto-replies on Meta gateway ingress when the potential_customer template is not sent
 * (customer is ready_for_llm): shares assigned ventor contact via whatsapp_cloud_ms.
 */
@Injectable()
export class CustomerMetaInboundReplyService {
  private readonly logger: Logger = new Logger(CustomerMetaInboundReplyService.name);

  constructor(
    private readonly ventorAssignment: CustomerVentorAssignmentService,
    private readonly potentialCustomersOutbound: CustomerPotentialCustomersOutboundService,
    private readonly conversationsService: CustomerConversationsService,
  ) {}

  async executeTrySendAssignedVentorContactReply(
    input: CustomerMetaInboundReplyInput,
  ): Promise<boolean> {
    const funnelStatus = input.customer.whatsappPotentialCustomerStatus ?? 'none';
    if (funnelStatus !== 'ready_for_llm') {
      this.logger.debug(
        `inbound reply skip: funnelStatus=${funnelStatus} customerId=${String(input.customer._id)}`,
      );
      return false;
    }
    if (!this.isReplyableMessageType(input.msg.type)) {
      this.logger.debug(
        `inbound reply skip: messageType=${input.msg.type} customerId=${String(input.customer._id)}`,
      );
      return false;
    }
    const inboundBody: string = this.extractInboundBody(input.msg).trim();
    if (inboundBody.length === 0) {
      this.logger.debug(
        `inbound reply skip: empty body customerId=${String(input.customer._id)}`,
      );
      return false;
    }
    const assignedTo: string = (input.customer.assignedTo ?? '').trim();
    if (assignedTo.length === 0) {
      this.logger.warn(
        `inbound reply skip: no assignedTo customerId=${String(input.customer._id)} waId=${input.normalizedWaId}`,
      );
      return false;
    }
    const ventor = await this.ventorAssignment.executeFindVentorById(assignedTo);
    if (ventor == null) {
      this.logger.warn(
        `inbound reply skip: ventor not found assignedTo=${assignedTo} customerId=${String(input.customer._id)}`,
      );
      return false;
    }
    const ventorDisplay = resolveVentorDisplayForCustomer(ventor);
    const body: string = formatVentorAssignmentMessageForCustomer({
      userName: ventorDisplay.userName,
      userPhone: ventorDisplay.userPhone,
    });
    const customerId: string = String(input.customer._id);
    await this.potentialCustomersOutbound.executeEmitPotentialCustomersEvent({
      type: 'potential_customers',
      payload: {
        action: 'send.potential_customer_text',
        waId: input.normalizedWaId,
        phoneNumberId: input.phoneNumberId,
        customerId,
        body,
      },
    });
    await this.executePersistOutboundConversation({
      customer: input.customer,
      normalizedWaId: input.normalizedWaId,
      phoneNumberId: input.phoneNumberId,
      contactName: input.contactName,
      body,
      inboundMessageId: input.msg.id,
    });
    this.logger.log(
      `inbound reply sent ventor contact customerId=${customerId} waId=${input.normalizedWaId} ventorId=${ventor.id}`,
    );
    return true;
  }

  private isReplyableMessageType(messageType: string): boolean {
    return messageType === 'text' || messageType === 'button';
  }

  private extractInboundBody(msg: MetaInboundMessage): string {
    if (msg.type === 'text') {
      return msg.text?.body ?? '';
    }
    if (msg.type === 'button') {
      return msg.button?.text ?? '';
    }
    return '';
  }

  private async executePersistOutboundConversation(input: {
    readonly customer: CustomerDocument;
    readonly normalizedWaId: string;
    readonly phoneNumberId: string;
    readonly contactName: string;
    readonly body: string;
    readonly inboundMessageId: string;
  }): Promise<void> {
    const phoneNumberId: string = input.phoneNumberId.trim();
    if (phoneNumberId.length === 0) {
      this.logger.warn('inbound reply: phoneNumberId missing; skip conversation upsert');
      return;
    }
    const sessionId: string = `cloud:${phoneNumberId}:${input.normalizedWaId}`;
    const outboundMessageId: string = `crm-inbound-reply:${input.inboundMessageId}`;
    const timestamp: number = Math.floor(Date.now() / 1000);
    await this.conversationsService.executeUpsertFromMetaIngress({
      sessionId,
      chatId: input.normalizedWaId,
      customerId: input.customer._id as Types.ObjectId,
      contactName: input.contactName,
      crmMessage: true,
      message: {
        messageId: outboundMessageId,
        fromMe: true,
        body: input.body,
        type: 'text',
        timestamp,
        hasMedia: false,
        mediaType: null,
        mediaPath: null,
        mediaMimeType: null,
        mediaFilename: null,
      },
    });
  }
}
