import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AddCustomerDescriptionDto } from './dto/add-customer-description.dto';
import { AddInterestedProjectDto } from './dto/add-interested-project.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
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
   * Creates a new customer record.
   */
  @Post()
  createCustomer(@Body() body: CreateCustomerDto) {
    return this.customerService.createCustomer(body);
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
  ) {
    return this.customerService.addCustomerDescription(customerId, body);
  }

  /**
   * Links an interested project to a customer.
   */
  @Post(':customerId/projects')
  addInterestedProject(
    @Param('customerId') customerId: string,
    @Body() body: AddInterestedProjectDto,
  ) {
    return this.customerService.addInterestedProject(customerId, body);
  }
}
