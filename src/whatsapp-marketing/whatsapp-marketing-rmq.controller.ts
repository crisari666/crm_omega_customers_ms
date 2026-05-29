import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { WhatsappMarketingStatusService } from './whatsapp-marketing-status.service';
import type { MarketingMessageStatusPayload } from './whatsapp-marketing-status.service';
import {
  WhatsappMarketingRecoveryReplyService,
  type MarketingReplyIngressInput,
} from './whatsapp-marketing-recovery-reply.service';

@Controller()
export class WhatsappMarketingRmqController {
  private readonly logger = new Logger(WhatsappMarketingRmqController.name);

  constructor(
    private readonly statusService: WhatsappMarketingStatusService,
    private readonly recoveryReplyService: WhatsappMarketingRecoveryReplyService,
  ) {}

  /**
   * Legacy pattern when Meta posted to whatsapp_cloud_ms. Production status updates
   * are applied in CustomerMetaWebhookService from gateway-forwarded status webhooks.
   */
  @EventPattern('customers.whatsapp.marketing.message.status.v1')
  async handleMessageStatus(
    @Payload() payload: MarketingMessageStatusPayload,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.statusService.executeApplyMessageStatus(payload);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`marketing.message.status.v1 failed: ${message}`);
    } finally {
      this.safeAck(context);
    }
  }

  /**
   * Legacy pattern when Meta posted to whatsapp_cloud_ms. Production ingress is
   * omega_gateway → customers.meta.webhook.ingress.v1 (CustomerMetaWebhookService).
   */
  @EventPattern('customers.whatsapp.marketing.reply.v1')
  async handleMarketingReply(
    @Payload() payload: MarketingReplyIngressInput,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.recoveryReplyService.executeHandleMarketingReply(payload);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`marketing.reply.v1 failed: ${message}`);
    } finally {
      this.safeAck(context);
    }
  }

  private safeAck(context: RmqContext): void {
    try {
      const channel = context.getChannelRef();
      channel.ack(context.getMessage(), false);
    } catch {
      return;
    }
  }
}
