import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AddInterestedProjectDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
