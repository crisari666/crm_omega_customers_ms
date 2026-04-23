import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { CustomerService } from './customer.service';
import { CustomerWhatsappEventsPublisher } from './customer-whatsapp-events.publisher';

type FindWhatsappCustomerPayload = {
  phone?: string;
  userSessionId?: string;
};

@Controller()
export class CustomerWhatsappRmqController {
  private readonly logger = new Logger(CustomerWhatsappRmqController.name);

  private safeAck(context: RmqContext): void {
    try {
      const channel = context.getChannelRef();
      channel.ack(context.getMessage(), false);
    } catch {
      /* channel closed or message already acked */
    }
  }

  constructor(
    private readonly customerService: CustomerService,
    private readonly customerWhatsappEventsPublisher: CustomerWhatsappEventsPublisher,
  ) {}

  @MessagePattern('customers.whatsapp.customer.lookup.v1')
  async findCustomerByWhatsappPhone(
    @Payload() payload: FindWhatsappCustomerPayload,
    @Ctx() context: RmqContext,
  ): Promise<{
    found: boolean;
    customerId: string | null;
    userSessionId?: string;
  }> {
    try {
      this.logger.log(
        `RPC customers.whatsapp.customer.lookup.v1 phone=${String(payload?.phone ?? '')} userSessionId=${String(payload?.userSessionId ?? '')}`,
      );
      const matched = await this.customerService.findCustomerForWhatsappLink(
        payload?.phone ?? '',
        payload?.userSessionId,
      );
      return {
        found: !!matched,
        customerId: matched?.customerId ?? null,
        ...(payload?.userSessionId ? { userSessionId: payload.userSessionId } : {}),
      };
    } finally {
      this.safeAck(context);
    }
  }

  @EventPattern('customers.whatsapp.chat.lookup.request.v1')
  async handleCustomerLookupRequestEvent(
    @Payload()
    payload: {
      sessionId?: string;
      userSessionId?: string;
      chatId?: string;
      phone?: string;
      messageId?: string;
    },
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      const sessionId = payload?.sessionId?.trim() ?? '';
      const userSessionId = payload?.userSessionId?.trim() ?? '';
      const chatId = payload?.chatId?.trim() ?? '';
      const phone = payload?.phone?.trim() ?? '';
      this.logger.log(
        `Event customers.whatsapp.chat.lookup.request.v1 chatId=${chatId} phone=${phone}`,
      );
      if (!sessionId || !userSessionId || !chatId || !phone) {
        return;
      }
      const matched = await this.customerService.findCustomerForWhatsappLink(
        phone,
        userSessionId,
      );
      if (!matched?.customerId) {
        return;
      }
      this.customerWhatsappEventsPublisher.emitCustomerLookupResolved({
        eventVersion: 'v1',
        eventName: 'customers.whatsapp.chat.lookup.resolved.v1',
        occurredAt: new Date().toISOString(),
        source: 'crm-omega-customers-ms',
        sessionId,
        userSessionId,
        chatId,
        customerId: matched.customerId,
        phone,
        found: true,
      });
    } finally {
      this.safeAck(context);
    }
  }
}
