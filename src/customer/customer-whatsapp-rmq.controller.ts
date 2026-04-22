import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { CustomerService } from './customer.service';
import { CustomerWhatsappEventsPublisher } from './customer-whatsapp-events.publisher';

type FindWhatsappCustomerPayload = {
  phone?: string;
  userSessionId?: string;
};

@Controller()
export class CustomerWhatsappRmqController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly customerWhatsappEventsPublisher: CustomerWhatsappEventsPublisher,
  ) {}

  @MessagePattern('customers.whatsapp.customer.lookup.v1')
  async findCustomerByWhatsappPhone(
    @Payload() payload: FindWhatsappCustomerPayload,
  ): Promise<{
    found: boolean;
    customerId: string | null;
    userSessionId?: string;
  }> {
    const matched = await this.customerService.findCustomerForWhatsappLink(
      payload?.phone ?? '',
      payload?.userSessionId,
    );
    return {
      found: !!matched,
      customerId: matched?.customerId ?? null,
      ...(payload?.userSessionId ? { userSessionId: payload.userSessionId } : {}),
    };
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
  ): Promise<void> {
    const sessionId = payload?.sessionId?.trim() ?? '';
    const userSessionId = payload?.userSessionId?.trim() ?? '';
    const chatId = payload?.chatId?.trim() ?? '';
    const phone = payload?.phone?.trim() ?? '';
    console.log('handleCustomerLookupRequestEvent', payload);
    if (!sessionId || !userSessionId || !chatId || !phone) {
      return;
    }
    const matched = await this.customerService.findCustomerForWhatsappLink(
      phone,
      userSessionId,
    );
    console.log('handleCustomerLookupRequestEvent matched', matched);
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
  }
}
