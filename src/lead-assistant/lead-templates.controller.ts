import { Controller, Get, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { ListLeadTemplatesQueryDto } from './dto/list-lead-templates-query.dto';
import { LeadTemplatesService } from './lead-templates.service';
import type { LeadTemplatesResponse } from './types/lead-templates-response.type';

/**
 * Approved WhatsApp templates of the leads line (for the assistant editors).
 * Registered on CustomerModule before CustomerAdminController.
 */
@Controller('admin/customer/lead-assistant/templates')
export class LeadTemplatesController {
  constructor(private readonly leadTemplatesService: LeadTemplatesService) {}

  @Get('test')
  testLeadTemplates(): { status: string } {
    return { status: 'lead-templates controller alive' };
  }

  @Get()
  listTemplates(
    @Query() query: ListLeadTemplatesQueryDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadTemplatesResponse> {
    assertOfficeAdmin(jwtUser);
    return this.leadTemplatesService.executeList(query.refresh ?? false);
  }
}
