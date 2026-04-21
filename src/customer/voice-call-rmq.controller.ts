import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomerCallLogsService } from './customer-call-logs.service';
import { IngestVoiceCallEventDto } from './dto/ingest-voice-call-event.dto';
import { SaveCallTranscriptionDto } from './dto/save-call-transcription.dto';

@Controller()
export class VoiceCallRmqController {
  private readonly logger = new Logger(VoiceCallRmqController.name);

  constructor(private readonly customerCallLogsService: CustomerCallLogsService) {}

  @EventPattern('voice.call.created')
  async handleCallCreated(
    @Payload() data: unknown,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    await this.executeIngest(data, context, 'create');
  }

  @EventPattern('voice.call.event')
  async handleCallEvent(
    @Payload() data: unknown,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    await this.executeIngest(data, context, 'append');
  }

  @EventPattern('voice.call.transcription')
  async handleTranscription(
    @Payload() data: unknown,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const message = context.getMessage();
    try {
      const dto: SaveCallTranscriptionDto = plainToInstance(SaveCallTranscriptionDto, data);
      const errors = await validate(dto);
      if (errors.length > 0) {
        throw new Error(`Transcription validation failed: ${JSON.stringify(errors)}`);
      }
      await this.customerCallLogsService.saveVoiceCallTranscription(dto);
      channel.ack(message);
    } catch (err) {
      const text: string = err instanceof Error ? err.message : String(err);
      this.logger.error(`voice.call.transcription handler failed: ${text}`);
      channel.nack(message, false, false);
    }
  }

  private async executeIngest(
    data: unknown,
    context: RmqContext,
    mode: 'create' | 'append',
  ): Promise<void> {
    const channel = context.getChannelRef();
    const message = context.getMessage();
    try {
      const dto: IngestVoiceCallEventDto = plainToInstance(IngestVoiceCallEventDto, data);
      const errors = await validate(dto);
      if (errors.length > 0) {
        throw new Error(`Call event validation failed: ${JSON.stringify(errors)}`);
      }
      if (mode === 'create') {
        await this.customerCallLogsService.createVoiceCall(dto);
      } else {
        await this.customerCallLogsService.appendVoiceCallEvent(dto);
      }
      channel.ack(message);
    } catch (err) {
      const text: string = err instanceof Error ? err.message : String(err);
      this.logger.error(`voice call ingest (${mode}) failed: ${text}`);
      channel.nack(message, false, false);
    }
  }
}
