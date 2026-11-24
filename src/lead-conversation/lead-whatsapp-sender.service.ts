import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import {
  LEAD_CONVERSATION_MARK_READ_PATTERN,
  LEAD_CONVERSATION_SEND_PATTERN,
  LEAD_SEND_RPC_TIMEOUT_MS,
  LEAD_WS_MS_CLIENT,
} from './constants/lead-conversation.constants';
import type { OutboundMessagePlan } from './types/outbound-message-plan.type';

export type LeadSendResult = {
  readonly success: boolean;
  readonly wamid?: string;
  readonly error?: string;
  readonly errorCode?: number;
};

/** RPC to whatsapp_cloud_ms `lead_conversation.send.v1` (leads WhatsApp line). */
@Injectable()
export class LeadWhatsappSenderService {
  private readonly logger = new Logger(LeadWhatsappSenderService.name);

  constructor(@Inject(LEAD_WS_MS_CLIENT) private readonly wsMsClient: ClientProxy) {}

  async executeSend(to: string, plan: OutboundMessagePlan): Promise<LeadSendResult> {
    const command = {
      to,
      kind: plan.kind,
      body: plan.body,
      mediaUrl: plan.mediaUrl,
      fileName: plan.fileName,
      buttons: plan.options,
      listButtonLabel: plan.listButtonLabel,
      contact: plan.contact,
      templateName: plan.templateName,
      languageCode: plan.languageCode,
      templateComponents: plan.templateComponents,
    };
    return lastValueFrom(
      this.wsMsClient.send<LeadSendResult>(LEAD_CONVERSATION_SEND_PATTERN, command).pipe(timeout(LEAD_SEND_RPC_TIMEOUT_MS)),
    );
  }

  /** Marks an inbound message as read and shows the typing indicator; never throws. */
  async executeMarkRead(messageId: string): Promise<void> {
    try {
      await lastValueFrom(
        this.wsMsClient
          .send<unknown>(LEAD_CONVERSATION_MARK_READ_PATTERN, { messageId, showTyping: true })
          .pipe(timeout(LEAD_SEND_RPC_TIMEOUT_MS)),
      );
    } catch (err) {
      this.logger.warn(`Mark read failed for ${messageId}: ${String(err)}`);
    }
  }
}
