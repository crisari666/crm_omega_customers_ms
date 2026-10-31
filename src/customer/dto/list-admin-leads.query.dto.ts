import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CUSTOMER_LEAD_SOURCES } from '../types/customer-lead-source.type';
import { CUSTOMER_LIFECYCLE_STATUSES } from '../types/customer-lifecycle-status.type';

const MAX_SEARCH_LENGTH = 120;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Query for `GET /admin/customer/leads`. */
export class ListAdminLeadsQueryDto {
  @IsOptional()
  @IsEnum(CUSTOMER_LIFECYCLE_STATUSES)
  lifecycleStatus?: (typeof CUSTOMER_LIFECYCLE_STATUSES)[number];

  @IsOptional()
  @IsEnum(CUSTOMER_LEAD_SOURCES)
  source?: (typeof CUSTOMER_LEAD_SOURCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number = DEFAULT_LIMIT;
}
