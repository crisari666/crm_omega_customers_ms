import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CreateLeadFaqDto } from './dto/create-lead-faq.dto';
import { ListLeadFaqsQueryDto } from './dto/list-lead-faqs-query.dto';
import { UpdateLeadFaqDto } from './dto/update-lead-faq.dto';
import { LeadFaqsService } from './lead-faqs.service';
import type { LeadFaqView } from './types/lead-faq-view.type';

/**
 * Admin CRUD of the assistant FAQs. `test` stays above `:id`.
 * Registered on CustomerModule before CustomerAdminController.
 */
@Controller('admin/customer/lead-assistant/faqs')
export class LeadFaqsController {
  constructor(private readonly leadFaqsService: LeadFaqsService) {}

  @Get('test')
  testLeadFaqs(): { status: string } {
    return { status: 'lead-faqs controller alive' };
  }

  @Get()
  listFaqs(
    @Query() query: ListLeadFaqsQueryDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadFaqView[]> {
    assertOfficeAdmin(jwtUser);
    return this.leadFaqsService.executeList(query);
  }

  @Post()
  createFaq(
    @Body() body: CreateLeadFaqDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadFaqView> {
    assertOfficeAdmin(jwtUser);
    return this.leadFaqsService.executeCreate(body, resolveOfficeUserId(jwtUser));
  }

  @Patch(':id')
  updateFaq(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @Body() body: UpdateLeadFaqDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadFaqView> {
    assertOfficeAdmin(jwtUser);
    return this.leadFaqsService.executeUpdate(id, body);
  }

  @Delete(':id')
  deleteFaq(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<{ readonly deleted: true }> {
    assertOfficeAdmin(jwtUser);
    return this.leadFaqsService.executeDelete(id);
  }
}
