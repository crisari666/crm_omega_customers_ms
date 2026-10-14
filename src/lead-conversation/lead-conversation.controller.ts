import { Controller, Get, Param, Query } from '@nestjs/common';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import { ListLeadConversationMessagesQueryDto } from './dto/list-lead-conversation-messages-query.dto';
import { LeadConversationQueryService } from './lead-conversation-query.service';
import type { LeadConversationMessagesPage } from './types/lead-conversation-messages-page.type';
import type { LeadConversationSummary } from './types/lead-conversation-summary.type';

/** Lead qualification data for ventor / admin apps (JWT via TokenJwtMiddleware on `/customer`). */
@Controller('customer')
export class LeadConversationController {
  constructor(private readonly queryService: LeadConversationQueryService) {}

  /** Smoke test (bypassed by TokenJwtMiddleware). */
  @Get('lead-conversation/test')
  test(): { status: string } {
    return { status: 'lead-conversation controller alive' };
  }

  @Get(':customerId/lead-conversation')
  getSummary(@Param('customerId', ParseHexObjectIdPipe) customerId: string): Promise<LeadConversationSummary> {
    return this.queryService.getSummary(customerId);
  }

  @Get(':customerId/lead-conversation/messages')
  listMessages(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
    @Query() query: ListLeadConversationMessagesQueryDto,
  ): Promise<LeadConversationMessagesPage> {
    return this.queryService.listMessages(customerId, query);
  }
}
