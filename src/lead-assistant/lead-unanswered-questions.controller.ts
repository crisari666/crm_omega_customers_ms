import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { ConvertLeadUnansweredQuestionDto } from './dto/convert-lead-unanswered-question.dto';
import { ListLeadUnansweredQuestionsQueryDto } from './dto/list-lead-unanswered-questions-query.dto';
import { UpdateLeadUnansweredQuestionDto } from './dto/update-lead-unanswered-question.dto';
import { LeadUnansweredQuestionsService } from './lead-unanswered-questions.service';
import type { LeadUnansweredQuestionConvertResult } from './types/lead-unanswered-question-convert-result.type';
import type { LeadUnansweredQuestionView } from './types/lead-unanswered-question-view.type';
import type { LeadUnansweredQuestionsPage } from './types/lead-unanswered-questions-page.type';

/**
 * Admin triage of questions the assistant could not answer.
 * Registered on CustomerModule before CustomerAdminController.
 */
@Controller('admin/customer/lead-assistant/unanswered-questions')
export class LeadUnansweredQuestionsController {
  constructor(private readonly leadUnansweredQuestionsService: LeadUnansweredQuestionsService) {}

  @Get('test')
  testLeadUnansweredQuestions(): { status: string } {
    return { status: 'lead-unanswered-questions controller alive' };
  }

  @Get()
  listQuestions(
    @Query() query: ListLeadUnansweredQuestionsQueryDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadUnansweredQuestionsPage> {
    assertOfficeAdmin(jwtUser);
    return this.leadUnansweredQuestionsService.executeList(query);
  }

  @Patch(':id')
  updateQuestion(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @Body() _body: UpdateLeadUnansweredQuestionDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadUnansweredQuestionView> {
    assertOfficeAdmin(jwtUser);
    return this.leadUnansweredQuestionsService.executeDismiss(id);
  }

  @Post(':id/convert')
  convertQuestion(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @Body() body: ConvertLeadUnansweredQuestionDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadUnansweredQuestionConvertResult> {
    assertOfficeAdmin(jwtUser);
    return this.leadUnansweredQuestionsService.executeConvert(id, body, resolveOfficeUserId(jwtUser));
  }
}
