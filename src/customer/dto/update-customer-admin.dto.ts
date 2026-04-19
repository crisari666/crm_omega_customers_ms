import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto';

/**
 * Admin PATCH body: all {@link CreateCustomerDto} fields optional, plus `enabled`.
 */
export class UpdateCustomerAdminDto extends PartialType(CreateCustomerDto) {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
