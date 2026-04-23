import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customer/schemas/customer.schema';
import { CustomerConversationsController } from './customer-conversations.controller';
import { CustomerConversationsRmqController } from './customer-conversations.rmq.controller';
import { CustomerConversationsService } from './customer-conversations.service';
import {
  CustomerWhatsappChat,
  CustomerWhatsappChatSchema,
} from './schemas/customer-whatsapp-chat.schema';
import {
  CustomerWhatsappMessage,
  CustomerWhatsappMessageSchema,
} from './schemas/customer-whatsapp-message.schema';
import {
  CustomerWhatsappUnresolved,
  CustomerWhatsappUnresolvedSchema,
} from './schemas/customer-whatsapp-unresolved.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerWhatsappChat.name, schema: CustomerWhatsappChatSchema },
      { name: CustomerWhatsappMessage.name, schema: CustomerWhatsappMessageSchema },
      { name: CustomerWhatsappUnresolved.name, schema: CustomerWhatsappUnresolvedSchema },
    ]),
  ],
  controllers: [CustomerConversationsController, CustomerConversationsRmqController],
  providers: [CustomerConversationsService],
  exports: [CustomerConversationsService],
})
export class CustomerConversationsModule {}
