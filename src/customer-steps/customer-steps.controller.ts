import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CreateCustomerStepDto } from './dto/create-customer-step.dto';
import { UpdateCustomerStepDto } from './dto/update-customer-step.dto';
import { CustomerStepsService } from './customer-steps.service';

/**
 * HTTP API for customer steps catalog.
 */
@Controller('customer-steps')
export class CustomerStepsController {
  constructor(private readonly customerStepsService: CustomerStepsService) {}

  @Get()
  listCustomerSteps() {
    return this.customerStepsService.listCustomerSteps();
  }

  @Post()
  createCustomerStep(
    @Body() body: CreateCustomerStepDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerStepsService.createCustomerStep(
      body,
      resolveOfficeUserId(jwtUser),
    );
  }

  @Patch(':stepId')
  updateCustomerStep(
    @Param('stepId') stepId: string,
    @Body() body: UpdateCustomerStepDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    return this.customerStepsService.updateCustomerStep(
      stepId,
      body,
      resolveOfficeUserId(jwtUser),
    );
  }
}
