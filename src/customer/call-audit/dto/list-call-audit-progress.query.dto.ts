import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ListCallAuditProgressQueryDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  agentExternalRef?: string;
}
