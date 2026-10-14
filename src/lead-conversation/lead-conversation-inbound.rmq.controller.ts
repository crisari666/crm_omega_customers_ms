import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { LEAD_CONVERSATION_INBOUND_PATTERN } from './constants/lead-conversation.constants';
import { LeadConversationInboundService } from './lead-conversation-inbound.service';

/** omega_gateway `POST /webhooks/lead_conversation` → RabbitMQ → lead qualification state machine. */
@Controller()
export class LeadConversationInboundRmqController {
  private readonly logger = new Logger(LeadConversationInboundRmqController.name);

  constructor(private readonly inboundService: LeadConversationInboundService) {}

  @EventPattern(LEAD_CONVERSATION_INBOUND_PATTERN)
  async handleInbound(@Payload() payload: unknown, @Ctx() context: RmqContext): Promise<void> {
    try {
      await this.inboundService.executeProcessIngress(payload);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`${LEAD_CONVERSATION_INBOUND_PATTERN} failed: ${message}`);
    } finally {
      this.safeAck(context);
    }
  }

  private safeAck(context: RmqContext): void {
    try {
      context.getChannelRef().ack(context.getMessage(), false);
    } catch {
      return;
    }
  }
}
