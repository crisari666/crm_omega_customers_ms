import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CustomerLeadsAdminService } from './customer-leads-admin.service';
import { ConvertAdminLeadDto } from './dto/convert-admin-lead.dto';
import { ListAdminLeadsQueryDto } from './dto/list-admin-leads.query.dto';
import type { AdminLeadListItem, AdminLeadListPage } from './types/admin-lead-list-item.type';

/**
 * Admin leads inbox (JWT via TokenJwtMiddleware on `/admin/customer`).
 * Must be registered in CustomerModule before CustomerAdminController so
 * `GET admin/customer/leads` is not captured by `GET admin/customer/:customerId`.
 */
@Controller('admin/customer')
export class CustomerLeadsAdminController {
  constructor(private readonly leadsAdminService: CustomerLeadsAdminService) {}

  @Get('leads')
  listLeads(@Query() query: ListAdminLeadsQueryDto): Promise<AdminLeadListPage> {
    return this.leadsAdminService.listLeads(query);
  }

  @Post('leads/:id/convert')
  convertLead(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @Body() body: ConvertAdminLeadDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<AdminLeadListItem> {
    return this.leadsAdminService.convertLead(id, body, resolveOfficeUserId(jwtUser));
  }
}
