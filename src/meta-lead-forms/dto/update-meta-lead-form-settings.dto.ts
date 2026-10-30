import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { MIN_OUTBOUND_DELAY_MINUTES } from '../constants/meta-lead-form.constants';

export class UpdateMetaLeadFormSettingsDto {
  @Type(() => Number)
  @IsInt()
  @Min(MIN_OUTBOUND_DELAY_MINUTES)
  outboundDelayMinutes: number;
}
