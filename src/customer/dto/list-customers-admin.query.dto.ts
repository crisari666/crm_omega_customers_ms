import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return undefined;
}

/**
 * Query params for admin customer list: creation date range, assignee, text search, pagination.
 */
export class ListCustomersAdminQueryDto {
  /**
   * When true, ignores `createdFrom` / `createdTo` and searches across all creation dates.
   */
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  omitDateRange?: boolean;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedTo?: string;

  /**
   * When true (and `assignedTo` is not set), only customers with no assignee.
   */
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  unassignedOnly?: boolean;

  /**
   * When true, only customers with `enabled !== false` (includes legacy docs without the field).
   * When false, only disabled (`enabled === false`). When omitted, no filter on enabled.
   */
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  enabled?: boolean;
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isReferral?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /**
   * When set, only customers whose current pipeline step matches this id.
   */
  @IsOptional()
  @IsMongoId()
  customerStepId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
