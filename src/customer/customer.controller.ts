import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { AddCustomerDescriptionDto } from './dto/add-customer-description.dto';
import { AddInterestedProjectDto } from './dto/add-interested-project.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { SetCustomerStepDto } from './dto/set-customer-step.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerEventDto } from './dto/create-customer-event.dto';
import { ListCustomerEventsQueryDto } from './dto/list-customer-events.query.dto';
import { ListCustomerMineQueryDto } from './dto/list-customer-mine.query.dto';
import { CustomerEventsService } from './customer-events.service';
import { CustomerService } from './customer.service';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';

/**
 * HTTP API for customers.
 */
@Controller('customer')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly customerEventsService: CustomerEventsService,
  ) {}

  /**
   * Smoke endpoint for health checks.
   */
  @Get('test')
  executeTest(): { status: string } {
    return { status: this.customerService.executePing() };
  }

  /**
   * KPIs for ventor home: customers created by JWT user with `assignedTo` set, and
   * completed office visits (schedule) for those customers.
   */
  @Get('mine/stats')
  getMyDashboardStats(@JwtUser() jwtUser: OfficeJwtPayload | undefined) {
    return this.customerService.getVendorMineDashboardStats(
      resolveOfficeUserId(jwtUser),
    );
  }

  /**
   * Customers whose `createdBy` matches JWT user (`userId` or `sub`).
   */
  @Get('mine')
  findMyCustomers(
    @Query() query: ListCustomerMineQueryDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const sort = query.sort === 'lastUpdate' ? 'lastUpdate' : 'createdAt';
    return this.customerService.findCustomersCreatedBy(
      resolveOfficeUserId(jwtUser),
      sort,
    );
  }

  /**
   * Loads one customer by Mongo `_id`.
   */
  @Get(':customerId')
  getCustomer(@Param('customerId', ParseHexObjectIdPipe) customerId: string) {
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

  @Post('normalize-contacts')
  normalizeContacts(
    @Body() body: { phone?: string; whatsapp?: string },
  ): { phone: string; whatsapp: string } {
    return this.customerService.normalizeCustomerContactNumbers(body);
  }

  /**
   * Normalizes stored contact numbers for all customers.
   */
  @Post('normalize-all-contacts')
  async normalizeAllContacts(): Promise<{
    total: number;
    updated: number;
    unchanged: number;
    conflicts: number;
  }> {
    return this.customerService.normalizeAllCustomerContactNumbers();
  }

  /**
   * Sets the customer's CRM pipeline step (not part of general `PATCH :customerId`).
   */
  @Patch(':customerId/step')
  setCustomerStep(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
    @Body() body: SetCustomerStepDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.setCustomerStep(
      customerId,
      body.customerStepId,
      resolveOfficeUserId(jwtUser),
    );
  }

  /**
   * Updates an existing customer.
   */
  @Patch(':customerId')
  updateCustomer(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
    @Body() body: UpdateCustomerDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.updateCustomer(
      customerId,
      body,
      resolveOfficeUserId(jwtUser),
    );
  }

  /**
   * Appends a structured description entry for a customer.
   */
  @Post(':customerId/descriptions')
  addCustomerDescription(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
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
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
    @Body() body: AddInterestedProjectDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerService.addInterestedProject(
      customerId,
      resolveOfficeUserId(jwtUser),
      body,
    );
  }

  @Post(':customerId/events')
  createCustomerEvent(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
    @Body() body: CreateCustomerEventDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerEventsService.createEvent({
      customerId,
      body,
      actorUserId: resolveOfficeUserId(jwtUser),
    });
  }

  @Get(':customerId/events')
  listCustomerEvents(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
    @Query() query: ListCustomerEventsQueryDto,
  ) {
    return this.customerEventsService.listByCustomerId(customerId, query);
  }

  /**
   * Sets `Customer.lastUpdate` from the latest `customer_events` row (scope: creator or assignee).
   */
  @Post(':customerId/last-update/recompute')
  recomputeCustomerLastUpdate(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerEventsService.recomputeCustomerLastUpdateFromEvents({
      customerId,
      actorUserId: resolveOfficeUserId(jwtUser),
    });
  }
}
