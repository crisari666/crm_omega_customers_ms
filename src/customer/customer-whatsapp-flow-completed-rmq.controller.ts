import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { CustomerWhatsappFlowCompletedService } from './customer-whatsapp-flow-completed.service';

type CustomersWhatsappFlowCompletedV1Payload = {
  readonly waId: string;
  readonly phoneNumberId: string;
  readonly flowResponse: unknown;
  readonly rawMessageId?: string;
};

@Controller()
export class CustomerWhatsappFlowCompletedRmqController {
  private readonly logger: Logger = new Logger(CustomerWhatsappFlowCompletedRmqController.name);

  constructor(private readonly flowCompletedService: CustomerWhatsappFlowCompletedService) {}

  @EventPattern('customers.whatsapp.flow.completed.v1')
  async handleFlowCompleted(
    @Payload() payload: CustomersWhatsappFlowCompletedV1Payload,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.flowCompletedService.executeProcessFlowCompleted({
        waId: String(payload?.waId ?? ''),
        phoneNumberId: String(payload?.phoneNumberId ?? ''),
        flowResponse: payload?.flowResponse,
        rawMessageId: payload?.rawMessageId,
      });
    } catch (error: unknown) {
      const message: string = error instanceof Error ? error.message : String(error);
      this.logger.error(`customers.whatsapp.flow.completed.v1 failed: ${message}`);
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
