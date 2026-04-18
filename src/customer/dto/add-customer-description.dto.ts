import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AddCustomerDescriptionDto {
  @IsString()
  description: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
