import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { AssignCustomerAssigneeDto } from './dto/assign-customer-assignee.dto';
import { CreateCustomerAdminDto } from './dto/create-customer-admin.dto';
import { ListCallLogsAdminQueryDto } from './dto/list-call-logs-admin.query.dto';
import { ListCustomersAdminQueryDto } from './dto/list-customers-admin.query.dto';
import { UpdateCustomerAdminDto } from './dto/update-customer-admin.dto';
import { ListCustomerEventsQueryDto } from './dto/list-customer-events.query.dto';
import { SearchCustomersAutocompleteQueryDto } from './dto/search-customers-autocomplete.query.dto';
import { UpdateCustomerReferralDto } from './dto/update-customer-referral.dto';
import { CustomerCallLogsService } from './customer-call-logs.service';
import { CustomerEventsService } from './customer-events.service';
import { CustomerAutocompleteService } from './customer-autocomplete.service';
import { CustomerMetaLeadgenService } from './customer-meta-leadgen.service';
import { CustomerService } from './customer.service';
import { CustomerStaffPerformanceService } from './customer-staff-performance.service';
import { StaffPerformanceBodyDto } from './dto/staff-performance.body.dto';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import { CustomerAdminImportService } from './customer-admin-import.service';
import { ImportCustomersAdminDto } from './dto/import-customers-admin.dto';
import { CustomerAssignmentAuditService } from './customer-assignment-audit.service';
import { ListCustomerAssignmentChangesQueryDto } from './dto/list-customer-assignment-changes.query.dto';
import { CallAuditLlmConfigService } from './call-audit/call-audit-llm-config.service';
import { CustomerCallAuditService } from './call-audit/customer-call-audit.service';
import { ListCallAuditAiReviewQueryDto } from './call-audit/dto/list-call-audit-ai-review.query.dto';
import { ListCallAuditProgressQueryDto } from './call-audit/dto/list-call-audit-progress.query.dto';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { SubmitHumanCallAuditDto } from './call-audit/dto/submit-human-call-audit.dto';

/**
 * Admin CRM HTTP API (crm_lots_agents). Vendor app keeps using {@link CustomerController} routes (`customer/mine`, etc.).
 */
@Controller('admin/customer')
export class CustomerAdminController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly customerCallLogsService: CustomerCallLogsService,
    private readonly customerEventsService: CustomerEventsService,
    private readonly customerAutocompleteService: CustomerAutocompleteService,
    private readonly customerStaffPerformanceService: CustomerStaffPerformanceService,
    private readonly customerAdminImportService: CustomerAdminImportService,
    private readonly customerMetaLeadgenService: CustomerMetaLeadgenService,
    private readonly customerAssignmentAuditService: CustomerAssignmentAuditService,
    private readonly callAuditLlmConfigService: CallAuditLlmConfigService,
    private readonly customerCallAuditService: CustomerCallAuditService,
  ) {}

  @Get()
  listCustomersAdmin(@Query() query: ListCustomersAdminQueryDto) {
    return this.customerService.listCustomersAdmin(query);
  }

  @Get('search')
  searchCustomersAutocomplete(@Query() query: SearchCustomersAutocompleteQueryDto) {
    return this.customerAutocompleteService.searchByText(query);
  }

  @Get('call-logs')
  listCallLogsAdmin(@Query() query: ListCallLogsAdminQueryDto) {
    return this.customerCallLogsService.listAdmin(query);
  }

  @Get('call-audit/config')
  getCallAuditConfig() {
    return this.callAuditLlmConfigService.getPublicConfig();
  }

  @Get('call-audit/progress')
  getCallAuditProgress(@Query() query: ListCallAuditProgressQueryDto) {
    return this.customerCallAuditService.getProgress(
      query.month,
      query.agentExternalRef,
    );
  }

  @Get('call-audit/ai-review')
  listCallAuditAiReview(
    @Query() query: ListCallAuditAiReviewQueryDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    return this.customerCallAuditService.listAiReviewForAdmin(query);
  }

  @Get('call-logs/:callLogId/audits')
  getCallAuditsByCallLogId(
    @Param('callLogId', ParseHexObjectIdPipe) callLogId: string,
  ) {
    return this.customerCallAuditService.getAuditsByCallLogId(callLogId);
  }

  @Post('call-logs/:callLogId/audit')
  submitHumanCallAudit(
    @Param('callLogId', ParseHexObjectIdPipe) callLogId: string,
    @Body() body: SubmitHumanCallAuditDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerCallAuditService.submitHumanAudit(
      callLogId,
      body,
      resolveOfficeUserId(jwtUser),
    );
  }

  @Post('call-logs/:callLogId/audit/analyze')
  analyzeCallAudit(
    @Param('callLogId', ParseHexObjectIdPipe) callLogId: string,
  ) {
    return this.customerCallAuditService.analyzeCallByCallLogId(callLogId);
  }

  @Post('staff-performance')
  postStaffPerformanceReport(@Body() body: StaffPerformanceBodyDto) {
    return this.customerStaffPerformanceService.getReport(body);
  }

  @Get('events')
  listCustomerEventsAdmin(@Query() query: ListCustomerEventsQueryDto) {
    return this.customerEventsService.listAdmin(query);
  }

  @Get('assignment-changes')
  listCustomerAssignmentChanges(
    @Query() query: ListCustomerAssignmentChangesQueryDto,
  ) {
    return this.customerAssignmentAuditService.listAdmin(query);
  }

  @Post('import')
  importCustomersAdmin(
    @Body() body: ImportCustomersAdminDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerAdminImportService.executeImportCustomersAdmin(
      body.customers,
      resolveOfficeUserId(jwtUser),
    );
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
  listCustomerCallLogs(@Param('customerId', ParseHexObjectIdPipe) customerId: string) {
    return this.customerCallLogsService.listForCustomer(customerId);
  }

  @Get(':customerId/meta-lead-mapped-fields')
  getCustomerMetaLeadMappedFieldsAdmin(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
  ) {
    return this.customerMetaLeadgenService.getMappedFieldsForCustomer(customerId);
  }

  @Get(':customerId')
  getCustomerAdminDetail(@Param('customerId', ParseHexObjectIdPipe) customerId: string) {
    return this.customerService.getCustomerAdminDetail(customerId);
  }

  @Patch(':customerId/assignee')
  assignCustomerAssignee(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
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
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
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
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
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
