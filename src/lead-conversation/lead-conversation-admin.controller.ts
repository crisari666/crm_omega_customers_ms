import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import { ListLeadConversationMessagesQueryDto } from './dto/list-lead-conversation-messages-query.dto';
import { ListLeadConversationsQueryDto } from './dto/list-lead-conversations-query.dto';
import { LeadConversationAdminService } from './lead-conversation-admin.service';
import { LeadConversationQueryService } from './lead-conversation-query.service';
import type { LeadConversationAdminListPage } from './types/lead-conversation-admin-list-page.type';
import type { LeadConversationMessagesPage } from './types/lead-conversation-messages-page.type';
import type { LeadConversationRestartResult } from './types/lead-conversation-restart-result.type';

/**
 * CRM admin view of AI lead conversations (JWT via TokenJwtMiddleware on `/admin/customer`).
 * The `/sessions` segment keeps `GET admin/customer/:customerId` from capturing the list route.
 */
@Controller('admin/customer/lead-conversations/sessions')
export class LeadConversationAdminController {
  constructor(
    private readonly adminService: LeadConversationAdminService,
    private readonly queryService: LeadConversationQueryService,
  ) {}

  @Get()
  listSessions(@Query() query: ListLeadConversationsQueryDto): Promise<LeadConversationAdminListPage> {
    return this.adminService.listSessions(query);
  }

  @Get(':sessionId/messages')
  listMessages(
    @Param('sessionId', ParseHexObjectIdPipe) sessionId: string,
    @Query() query: ListLeadConversationMessagesQueryDto,
  ): Promise<LeadConversationMessagesPage> {
    return this.queryService.listMessagesBySession(sessionId, query);
  }

  @Delete(':sessionId')
  deleteSession(@Param('sessionId', ParseHexObjectIdPipe) sessionId: string): Promise<{ deleted: true }> {
    return this.adminService.deleteSession(sessionId);
  }

  @Post(':sessionId/restart')
  @HttpCode(HttpStatus.OK)
  restartSession(@Param('sessionId', ParseHexObjectIdPipe) sessionId: string): Promise<LeadConversationRestartResult> {
    return this.adminService.restartSession(sessionId);
  }
}
