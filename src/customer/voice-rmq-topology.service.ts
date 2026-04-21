import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect } from 'amqplib';

const VOICE_CALL_ROUTING_PATTERN = 'voice.call.*';

/**
 * Declares topic exchange + queue + binding. Nest RMQ transport only asserts the queue.
 */
@Injectable()
export class VoiceRmqTopologyService {
  constructor(private readonly configService: ConfigService) {}

  async ensureVoiceCallBindings(): Promise<void> {
    const url: string = (this.configService.get<string>('rabbitmq.url', '') ?? '').trim();
    if (url === '') {
      return;
    }
    const exchange: string =
      this.configService.get<string>('rabbitmq.voiceExchange', '') || 'omega.voice';
    const queue: string =
      this.configService.get<string>('rabbitmq.voiceQueue', '') || 'crm.customers.voice_call_logs';
    const connection = await connect(url);
    const channel = await connection.createChannel();
    try {
      await channel.assertExchange(exchange, 'topic', { durable: true });
      await channel.assertQueue(queue, { durable: true });
      await channel.bindQueue(queue, exchange, VOICE_CALL_ROUTING_PATTERN);
    } finally {
      await channel.close();
      await connection.close();
    }
  }
}
