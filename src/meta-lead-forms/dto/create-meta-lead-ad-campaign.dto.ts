import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMetaLeadAdCampaignDto {
  @IsString()
  @MinLength(1)
  adId: string;

  @IsString()
  @MinLength(1)
  adName: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  campaignName?: string;

  @IsString()
  @MinLength(1)
  projectId: string;

  @IsOptional()
  @IsString()
  projectTitle?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
