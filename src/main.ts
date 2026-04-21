import './express-augmentation';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { VoiceCrmInboundDeserializer } from './customer/voice-crm-inbound.deserializer';
import { VoiceRmqTopologyService } from './customer/voice-rmq-topology.service';

function trimEnv(value: string | undefined): string {
  return (value ?? '').trim();
}

async function bootstrap() {
  const port = process.env.APP_PORT || 4001;
  const app = await NestFactory.create(AppModule);
  const rabbitUrl: string = trimEnv(process.env.RABBITMQ_URL);
  if (rabbitUrl !== '') {
    const topology: VoiceRmqTopologyService = app.get(VoiceRmqTopologyService);
    await topology.ensureVoiceCallBindings();
    const queue: string =
      trimEnv(process.env.RABBITMQ_VOICE_QUEUE) || 'crm.customers.voice_call_logs';
    const prefetchRaw: string = trimEnv(process.env.RABBITMQ_PREFETCH);
    const parsedPrefetch: number = Number.parseInt(prefetchRaw || '10', 10);
    const prefetchCount: number =
      Number.isFinite(parsedPrefetch) && parsedPrefetch > 0 ? parsedPrefetch : 10;
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitUrl],
        queue,
        prefetchCount,
        noAck: false,
        deserializer: new VoiceCrmInboundDeserializer(),
        queueOptions: { durable: true },
      },
    });
    await app.startAllMicroservices();
  }

  app.setGlobalPrefix('customers-rest');
  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    //allowedHeaders: ['Content-Type', 'TOKEN'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(port);
}
bootstrap();
