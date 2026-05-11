import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CreateCustomerPaymentDto } from './dto/create-customer-payment.dto';
import { ListCustomerPaymentsQueryDto } from './dto/list-customer-payments-query.dto';
import { CustomerPaymentService } from './customer-payment.service';

/**
 * HTTP API for customer payment records.
 */
@Controller('customer-payment')
export class CustomerPaymentController {
  constructor(
    private readonly customerPaymentService: CustomerPaymentService,
  ) {}

  @Post()
  async createPayment(
    @Body() body: CreateCustomerPaymentDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const recordedBy = resolveOfficeUserId(jwtUser);
    return this.customerPaymentService.createPayment(body, recordedBy);
  }

  @Get()
  async listPayments(@Query() query: ListCustomerPaymentsQueryDto) {
    return this.customerPaymentService.listPayments(query);
  }

  @Get('by-customer/:customerId')
  async listByCustomer(@Param('customerId') customerId: string) {
    return this.customerPaymentService.listByCustomer(customerId);
  }

  @Get('summary/by-customer/:customerId')
  async getSummaryByCustomer(@Param('customerId') customerId: string) {
    return this.customerPaymentService.getSummaryByCustomer(customerId);
  }
}
