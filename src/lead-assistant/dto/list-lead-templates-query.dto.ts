import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/** `refresh=true` bypasses the 5-minute templates cache. */
export class ListLeadTemplatesQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  refresh?: boolean;
}
