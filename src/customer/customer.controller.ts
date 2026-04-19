import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { AddCustomerDescriptionDto } from './dto/add-customer-description.dto';
import { AddInterestedProjectDto } from './dto/add-interested-project.dto';
import { CreateCustomerAdminDto } from './dto/create-customer-admin.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersAdminQueryDto } from './dto/list-customers-admin.query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerService } from './customer.service';

/**
 * HTTP API for customers.
 */
@Controller('customer')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  /**
   * Smoke endpoint for health checks.
   */
  @Get('test')
  executeTest(): { status: string } {
    return { status: this.customerService.executePing() };
  }

  /**
   * Customers whose `createdBy` matches JWT user (`userId` or `sub`).
   */
  @Get('mine')
  findMyCustomers(@JwtUser() jwtUser: OfficeJwtPayload | undefined) {
    return this.customerService.findCustomersCreatedBy(
      resolveOfficeUserId(jwtUser),
    );
  }

  /**
   * Admin list: filter by creation date range, assignee, name/email/phone search; paginated lean payload.
   */
  @Get('admin')
  listCustomersAdmin(@Query() query: ListCustomersAdminQueryDto) {
    return this.customerService.listCustomersAdmin(query);
  }

  /**
   * Loads one customer by Mongo `_id`.
   */
  @Get(':customerId')
  getCustomer(@Param('customerId') customerId: string) {
    return this.customerService.getCustomerById(customerId);
  }

  /**
   * Creates a new customer record.
   */
  @Post()
  createCustomer(
    @Body() body: CreateCustomerDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.createCustomer(
      body,
      resolveOfficeUserId(jwtUser),
    );
  }

  /**
   * Admin create: only `phone` required; optional name, lastName, email, user (assignee).
   */
  @Post('admin')
  createCustomerAdmin(
    @Body() body: CreateCustomerAdminDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.createCustomerAdmin(
      body,
      resolveOfficeUserId(jwtUser),
    );
  }

  /**
   * Updates an existing customer.
   */
  @Patch(':customerId')
  updateCustomer(
    @Param('customerId') customerId: string,
    @Body() body: UpdateCustomerDto,
  ) {
    return this.customerService.updateCustomer(customerId, body);
  }

  /**
   * Appends a structured description entry for a customer.
   */
  @Post(':customerId/descriptions')
  addCustomerDescription(
    @Param('customerId') customerId: string,
    @Body() body: AddCustomerDescriptionDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.addCustomerDescription(
      customerId,
      resolveOfficeUserId(jwtUser),
      body,
    );
  }

  /**
   * Links an interested project to a customer.
   */
  @Post(':customerId/projects')
  addInterestedProject(
    @Param('customerId') customerId: string,
    @Body() body: AddInterestedProjectDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.addInterestedProject(
      customerId,
      resolveOfficeUserId(jwtUser),
      body,
    );
  }
}
