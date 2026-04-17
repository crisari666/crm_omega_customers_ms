import { Controller, Get } from '@nestjs/common';
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
}
