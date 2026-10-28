import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import {
  LEAD_CONVERSATION_SEND_PATTERN,
  LEAD_SEND_RPC_TIMEOUT_MS,
  LEAD_WS_MS_CLIENT,
} from './constants/lead-conversation.constants';
import type { OutboundMessagePlan } from './types/outbound-message-plan.type';

export type LeadSendResult = {
  readonly success: boolean;
  readonly wamid?: string;
  readonly error?: string;
};

/** RPC to whatsapp_cloud_ms `lead_conversation.send.v1` (leads WhatsApp line). */
@Injectable()
export class LeadWhatsappSenderService {
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
    };
    return lastValueFrom(
      this.wsMsClient.send<LeadSendResult>(LEAD_CONVERSATION_SEND_PATTERN, command).pipe(timeout(LEAD_SEND_RPC_TIMEOUT_MS)),
    );
  }
}
