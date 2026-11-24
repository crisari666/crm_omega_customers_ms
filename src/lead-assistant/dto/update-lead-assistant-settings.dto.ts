import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import type { LeadFlowVersion } from '../../lead-conversation/types/lead-flow-version.type';
import {
  LEAD_REPLY_DEBOUNCE_MAX_SECONDS,
  LEAD_REPLY_DEBOUNCE_MIN_SECONDS,
} from '../constants/lead-assistant.constants';
import { LEAD_PRICE_POLICIES, type LeadPricePolicy } from '../types/lead-price-policy.type';
import { LeadTemplateRefDto } from './lead-template-ref.dto';

/** Partial update of the assistant settings; `welcomeTemplate: null` clears it. */
export class UpdateLeadAssistantSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  assistantName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  greeting?: string;

  @IsOptional()
  @IsIn(LEAD_PRICE_POLICIES)
  pricePolicy?: LeadPricePolicy;

  @IsOptional()
  @IsIn(['v1', 'v2'])
  defaultInboundFlow?: LeadFlowVersion;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(LEAD_REPLY_DEBOUNCE_MIN_SECONDS)
  @Max(LEAD_REPLY_DEBOUNCE_MAX_SECONDS)
  replyDebounceSeconds?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @ValidateNested()
  @Type(() => LeadTemplateRefDto)
  welcomeTemplate?: LeadTemplateRefDto | null;
}
