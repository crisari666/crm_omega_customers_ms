import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { CustomerMetaWebhookService } from './customer-meta-webhook.service';

@Controller()
export class CustomerMetaWebhookRmqController {
  private readonly logger: Logger = new Logger(CustomerMetaWebhookRmqController.name);

  constructor(private readonly customerMetaWebhookService: CustomerMetaWebhookService) {}

  @EventPattern('customers.meta.webhook.ingress.v1')
  async handleMetaWebhookIngress(
    @Payload() payload: unknown,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      
      
      await this.customerMetaWebhookService.executeProcessMetaIngress(payload);
    } catch (error: unknown) {
      const message: string = error instanceof Error ? error.message : String(error);
      this.logger.error(`customers.meta.webhook.ingress.v1 failed: ${message}`);
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
