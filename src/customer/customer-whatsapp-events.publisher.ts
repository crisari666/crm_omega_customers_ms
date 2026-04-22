import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class CustomerWhatsappEventsPublisher {
  constructor(
    @Inject('WHATSAPP_MS_SERVICE')
    private readonly whatsappClient: ClientProxy,
  ) {}

  emitCustomerLookupResolved(payload: {
    eventVersion: 'v1';
    eventName: 'customers.whatsapp.chat.lookup.resolved.v1';
    occurredAt: string;
    source: 'crm-omega-customers-ms';
    sessionId: string;
    userSessionId: string;
    chatId: string;
    customerId: string;
    phone: string;
    found: boolean;
  }) {
    return this.whatsappClient.emit(
      'customers.whatsapp.chat.lookup.resolved.v1',
      payload,
    );
  }
}
