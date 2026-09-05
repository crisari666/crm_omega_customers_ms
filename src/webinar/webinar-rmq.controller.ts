import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { WebinarIngestService } from './webinar-ingest.service';

@Controller()
export class WebinarRmqController {
  private readonly logger = new Logger(WebinarRmqController.name);

  constructor(private readonly webinarIngestService: WebinarIngestService) {}

  @EventPattern('customers.meta.webinar_lead.ingest.v1')
  async handleWebinarLeadIngest(
    @Payload() payload: unknown,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.webinarIngestService.executeProcessWebinarLeadIngress(payload);
    } catch (error: unknown) {
      const message: string = error instanceof Error ? error.message : String(error);
      this.logger.error(`customers.meta.webinar_lead.ingest.v1 failed: ${message}`);
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
