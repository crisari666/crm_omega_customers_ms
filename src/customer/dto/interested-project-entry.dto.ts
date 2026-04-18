import { IsDateString, IsOptional, IsString } from 'class-validator';

export class InterestedProjectEntryDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
