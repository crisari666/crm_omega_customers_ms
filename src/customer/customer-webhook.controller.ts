import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IngestVoiceCallEventDto } from './dto/ingest-voice-call-event.dto';
import { SaveCallTranscriptionDto } from './dto/save-call-transcription.dto';
import { CustomerCallLogsService } from './customer-call-logs.service';

const VOICE_WEBHOOK_HEADER_NAME = 'x-voice-webhook-token';

@Controller('webhooks/voice/calls')
export class CustomerWebhookController {
  constructor(
    private readonly customerCallLogsService: CustomerCallLogsService,
  ) {}

  @Post('create')
  async createCall(
    @Body() body: IngestVoiceCallEventDto,
    @Headers(VOICE_WEBHOOK_HEADER_NAME) token: string | undefined,
  ) {
    this.validateWebhookToken(token);
    const result = await this.customerCallLogsService.createVoiceCall(body);
    return { message: 'accepted', result };
  }

  @Post('events')
  async storeCallEvent(
    @Body() body: IngestVoiceCallEventDto,
    @Headers(VOICE_WEBHOOK_HEADER_NAME) token: string | undefined,
  ) {
    this.validateWebhookToken(token);
    const result = await this.customerCallLogsService.appendVoiceCallEvent(body);
    return { message: 'accepted', result };
  }

  @Post('transcription')
  async storeCallTranscription(
    @Body() body: SaveCallTranscriptionDto,
    @Headers(VOICE_WEBHOOK_HEADER_NAME) token: string | undefined,
  ) {
    this.validateWebhookToken(token);
    const result = await this.customerCallLogsService.saveVoiceCallTranscription(
      body,
    );
    return { message: 'accepted', result };
  }

  private validateWebhookToken(token: string | undefined): void {
    const expectedToken: string = this.normalizeToken(
      process.env.VOICE_WEBHOOK_TOKEN,
    );
    const receivedToken: string = this.normalizeToken(token);
    if (expectedToken === '') {
      throw new UnauthorizedException('VOICE_WEBHOOK_TOKEN is not configured');
    }
    if (receivedToken !== expectedToken) {
      throw new UnauthorizedException('Invalid voice webhook token');
    }
  }

  private normalizeToken(rawValue: string | undefined): string {
    const value: string = (rawValue ?? '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1).trim();
    }
    return value;
  }
}
