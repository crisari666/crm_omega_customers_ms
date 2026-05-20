import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { CustomerMetaLeadgenService } from './customer-meta-leadgen.service';

@Controller()
export class CustomerMetaLeadgenRmqController {
  private readonly logger = new Logger(CustomerMetaLeadgenRmqController.name);

  constructor(private readonly customerMetaLeadgenService: CustomerMetaLeadgenService) {}

  @EventPattern('customers.meta.leadgen.ingest.v1')
  async handleMetaLeadgenIngest(
    @Payload() payload: unknown,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.customerMetaLeadgenService.executeProcessLeadgenIngress(payload);
    } catch (error: unknown) {
      const message: string = error instanceof Error ? error.message : String(error);
      this.logger.error(`customers.meta.leadgen.ingest.v1 failed: ${message}`);
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
