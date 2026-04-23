import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { CustomersWhatsappMessageUpsertV1 } from './models/customers-whatsapp-message-upsert-v1.model';
import { CustomerConversationsService } from './customer-conversations.service';

@Controller()
export class CustomerConversationsRmqController {
  private readonly logger: Logger = new Logger(CustomerConversationsRmqController.name);

  constructor(
    private readonly customerConversationsService: CustomerConversationsService,
  ) {}

  @EventPattern('customers.whatsapp.message.upsert.v1')
  async handleWhatsappMessageUpsert(
    @Payload() payload: CustomersWhatsappMessageUpsertV1,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.customerConversationsService.executeUpsertFromEvent(payload);
    } catch (error: unknown) {
      const message: string = error instanceof Error ? error.message : String(error);
      this.logger.error(`RMQ upsert failed: ${message}`);
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
