import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MarketingAudienceFilterDto } from './marketing-audience-filter.dto';
import {
  WHATSAPP_MARKETING_BATCH_DELAY_MS_MAX,
  WHATSAPP_MARKETING_BATCH_DELAY_MS_MIN,
} from '../constants/whatsapp-marketing-batch-delay.constants';

export class CreateWhatsappMarketingCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  templateName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  templateComponents?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  @MaxLength(256)
  templateHeaderMediaId?: string;

  @IsOptional()
  @IsEnum(['image', 'video'])
  templateHeaderMediaType?: 'image' | 'video';

  @IsEnum(['filter', 'manual', 'combined'])
  audienceMode!: 'filter' | 'manual' | 'combined';

  @IsOptional()
  @ValidateNested()
  @Type(() => MarketingAudienceFilterDto)
  audienceFilter?: MarketingAudienceFilterDto;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  manualCustomerIds?: string[];

  @IsOptional()
  @IsEnum(['standard', 'recovery_potential'])
  campaignType?: 'standard' | 'recovery_potential';

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  preserveAssigneeCustomerStepIds?: string[];

  @IsOptional()
  @IsMongoId()
  replyAdvanceToCustomerStepId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  batchSize!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(WHATSAPP_MARKETING_BATCH_DELAY_MS_MIN)
  @Max(WHATSAPP_MARKETING_BATCH_DELAY_MS_MAX)
  batchDelayMs?: number;
}
