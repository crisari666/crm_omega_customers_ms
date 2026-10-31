import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateCustomerStepDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPotentialBuyer?: boolean;

  /** Positive days, or `null` on update to clear (fall back to 30-day default). */
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ventorMineVisibilityDays?: number | null;
}
