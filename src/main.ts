import './express-augmentation';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { VoiceCrmInboundDeserializer } from './customer/voice-crm-inbound.deserializer';
import { VoiceRmqTopologyService } from './customer/voice-rmq-topology.service';
import configuration from './config/configuration';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const port = process.env.APP_PORT || 4001;
  const app = await NestFactory.create(AppModule);
  const rabbitUrl: string = configuration().rabbitmq.url;

  if (rabbitUrl !== '') {
    const topology: VoiceRmqTopologyService = app.get(VoiceRmqTopologyService);
    await topology.ensureVoiceCallBindings();
    const { voiceQueue, integrationQueue, prefetch: prefetchCount } = configuration().rabbitmq;
    const rmqBaseOptions = {
      urls: [rabbitUrl],
      prefetchCount,
      noAck: false,
      //queueOptions: { durable: true },
    };

    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        ...rmqBaseOptions,
        queue: voiceQueue,
        deserializer: new VoiceCrmInboundDeserializer(),
      },
    });

    // crm_whatsapp_ms send/emit: default Nest deserializer (VoiceCrmInboundDeserializer throws on non-voice non-Nest edge cases).
    if (integrationQueue !== voiceQueue) {
      app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.RMQ,
        options: {
          ...rmqBaseOptions,
          queue: integrationQueue,
        },
      });
    }

    await app.startAllMicroservices();
    logger.log(
      `RabbitMQ microservices started (voiceQueue=${voiceQueue}, integrationQueue=${integrationQueue})`,
    );
  } else {
    logger.warn(
      'RabbitMQ URL empty; microservices not started. WhatsApp/customer RPC handlers inactive.',
    );
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
