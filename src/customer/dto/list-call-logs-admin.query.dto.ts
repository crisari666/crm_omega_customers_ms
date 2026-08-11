import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class ListCallLogsAdminQueryDto {
  @IsOptional()
  @IsDateString()
  callFrom?: string;

  @IsOptional()
  @IsDateString()
  callTo?: string;

  @IsOptional()
  @IsIn(['all', 'answered', 'busy', 'no_answer'])
  outcome?: 'all' | 'answered' | 'busy' | 'no_answer';

  @IsOptional()
  @IsIn(['all', 'voip', 'meet'])
  channel?: 'all' | 'voip' | 'meet';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
