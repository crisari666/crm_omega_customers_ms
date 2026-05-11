import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { CoreModule } from './core/core.module';
import { TokenJwtMiddleware } from './core/middleware/token-jwt.middleware';
import { CustomerModule } from './customer/customer.module';
import { CustomerConversationsModule } from './customer-conversations/customer-conversations.module';
import { CustomerStepsModule } from './customer-steps/customer-steps.module';
import { CustomerPaymentModule } from './customer-payment/customer-payment.module';
import { VentorScheduleModule } from './ventor-schedule/ventor-schedule.module';

@Module({
  imports: [
    CoreModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('database.uri'),
      }),
    }),
    CustomerModule,
    CustomerConversationsModule,
    CustomerStepsModule,
    CustomerPaymentModule,
    VentorScheduleModule,
  ],
  controllers: [AppController],
  providers: [AppService, TokenJwtMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TokenJwtMiddleware).forRoutes('*');
  }
}
