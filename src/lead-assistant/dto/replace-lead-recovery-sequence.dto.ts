import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { LeadRecoveryStepDto } from './lead-recovery-step.dto';

/** Replaces the whole recovery sequence. */
export class ReplaceLeadRecoverySequenceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadRecoveryStepDto)
  steps: LeadRecoveryStepDto[];
}
