import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomerStepDto } from './create-customer-step.dto';

export class UpdateCustomerStepDto extends PartialType(CreateCustomerStepDto) {}
