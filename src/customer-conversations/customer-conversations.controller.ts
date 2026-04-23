import { Controller, Get, Param, Query } from '@nestjs/common';
import { GetCustomerConversationQueryDto } from './dto/get-customer-conversation.query.dto';
import { CustomerConversationsService } from './customer-conversations.service';

@Controller('customer-conversations')
export class CustomerConversationsController {
  constructor(
    private readonly customerConversationsService: CustomerConversationsService,
  ) {}

  @Get('customer/:customerId/chats')
  async getCustomerChats(
    @Param('customerId') customerId: string,
    @Query() query: GetCustomerConversationQueryDto,
  ) {
    return this.customerConversationsService.findChatsByCustomerId({
      customerId,
      limit: query.limit,
      skip: query.skip,
    });
  }

  @Get('customer/:customerId/chats/:chatId/messages')
  async getCustomerChatMessages(
    @Param('customerId') customerId: string,
    @Param('chatId') chatId: string,
    @Query() query: GetCustomerConversationQueryDto,
  ) {
    return this.customerConversationsService.findMessagesByCustomerIdAndChatId({
      customerId,
      chatId,
      limit: query.limit,
      skip: query.skip,
    });
  }
}
