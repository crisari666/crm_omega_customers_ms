import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';
import { WebinarLeadStatus } from '../schemas/webinar-lead.schema';

export class ListWebinarLeadsQueryDto {
  @IsOptional()
  @IsMongoId()
  webinarEventId?: string;

  @IsOptional()
  @IsEnum(WebinarLeadStatus)
  status?: WebinarLeadStatus;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
