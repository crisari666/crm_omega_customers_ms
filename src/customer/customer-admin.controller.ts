import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { AssignCustomerAssigneeDto } from './dto/assign-customer-assignee.dto';
import { CreateCustomerAdminDto } from './dto/create-customer-admin.dto';
import { ListCallLogsAdminQueryDto } from './dto/list-call-logs-admin.query.dto';
import { ListCustomersAdminQueryDto } from './dto/list-customers-admin.query.dto';
import { UpdateCustomerAdminDto } from './dto/update-customer-admin.dto';
import { UpdateCustomerReferralDto } from './dto/update-customer-referral.dto';
import { CustomerCallLogsService } from './customer-call-logs.service';
import { CustomerService } from './customer.service';

/**
 * Admin CRM HTTP API (crm_lots_agents). Vendor app keeps using {@link CustomerController} routes (`customer/mine`, etc.).
 */
@Controller('admin/customer')
export class CustomerAdminController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly customerCallLogsService: CustomerCallLogsService,
  ) {}

  @Get()
  listCustomersAdmin(@Query() query: ListCustomersAdminQueryDto) {
    return this.customerService.listCustomersAdmin(query);
  }

  @Get('call-logs')
  listCallLogsAdmin(@Query() query: ListCallLogsAdminQueryDto) {
    return this.customerCallLogsService.listAdmin(query);
  }

  @Post()
  createCustomerAdmin(
    @Body() body: CreateCustomerAdminDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.createCustomerAdmin(
      body,
      resolveOfficeUserId(jwtUser),
    );
  }

  @Get(':customerId/call-logs')
  listCustomerCallLogs(@Param('customerId') customerId: string) {
    return this.customerCallLogsService.listForCustomer(customerId);
  }

  @Get(':customerId')
  getCustomerAdminDetail(@Param('customerId') customerId: string) {
    return this.customerService.getCustomerAdminDetail(customerId);
  }

  @Patch(':customerId/assignee')
  assignCustomerAssignee(
    @Param('customerId') customerId: string,
    @Body() body: AssignCustomerAssigneeDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.assignCustomerAssignee(
      customerId,
      body,
      resolveOfficeUserId(jwtUser),
    );
  }

  @Patch(':customerId')
  updateCustomerAdmin(
    @Param('customerId') customerId: string,
    @Body() body: UpdateCustomerAdminDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.updateCustomerAdmin(
      customerId,
      body,
      resolveOfficeUserId(jwtUser),
    );
  }

  @Patch(':customerId/referral')
  updateCustomerReferral(
    @Param('customerId') customerId: string,
    @Body() body: UpdateCustomerReferralDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.updateCustomerReferral(
      customerId,
      body,
      resolveOfficeUserId(jwtUser),
    );
  }
}
