import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMetaLeadAdCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  campaignName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  projectId?: string;

  @IsOptional()
  @IsString()
  projectTitle?: string;

  @IsOptional()
  @IsString()
  adId?: string;

  @IsOptional()
  @IsString()
  adName?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
