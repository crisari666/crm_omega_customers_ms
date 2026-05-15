import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type { PotentialCustomersMsEvent } from './types/potential-customers-ms-event.type';

/**
 * Emits WhatsApp Cloud MS commands for the potential-customer funnel on {@link WS_MS_QUEUE}.
 */
@Injectable()
export class CustomerPotentialCustomersOutboundService {
  private readonly logger: Logger = new Logger(CustomerPotentialCustomersOutboundService.name);

  constructor(
    @Inject('WS_MS_QUEUE') private readonly wsMsClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Fire-and-forget emit when RabbitMQ URL is configured; otherwise no-op.
   */
  async executeEmitPotentialCustomersEvent(event: PotentialCustomersMsEvent): Promise<void> {
    const rabbitUrl: string = this.configService.get<string>('rabbitmq.url', '') ?? '';
    if (rabbitUrl.trim() === '') {
      this.logger.warn('Skipping potential_customers.ms_ws emit: rabbitmq.url empty');
      return;
    }
    await lastValueFrom(this.wsMsClient.emit('potential_customers.ms_ws', event));
  }
}
