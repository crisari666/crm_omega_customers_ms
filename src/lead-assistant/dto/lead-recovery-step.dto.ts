import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import {
  LEAD_RECOVERY_MAX_OFFSET_HOURS,
  LEAD_RECOVERY_MIN_OFFSET_HOURS,
} from '../constants/lead-assistant.constants';
import { LeadTemplateRefDto } from './lead-template-ref.dto';

/** One recovery step; counters are server-owned and cannot be sent. */
export class LeadRecoveryStepDto {
  /** Omit for new steps: the server assigns the id. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  id?: string;

  @IsString()
  @MinLength(1)
  label: string;

  @IsInt()
  @Min(LEAD_RECOVERY_MIN_OFFSET_HOURS)
  @Max(LEAD_RECOVERY_MAX_OFFSET_HOURS)
  offsetHours: number;

  @IsBoolean()
  enabled: boolean;

  @ValidateNested()
  @Type(() => LeadTemplateRefDto)
  template: LeadTemplateRefDto;
}
