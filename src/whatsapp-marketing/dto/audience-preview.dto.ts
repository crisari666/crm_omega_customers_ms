import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsMongoId, IsOptional, ValidateNested } from 'class-validator';
import { MarketingAudienceFilterDto } from './marketing-audience-filter.dto';

export class AudiencePreviewBodyDto {
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
}
