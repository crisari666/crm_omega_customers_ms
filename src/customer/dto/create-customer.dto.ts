import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { DocumentType } from '../schemas/customer.schema';
import { InterestedProjectEntryDto } from './interested-project-entry.dto';

export class CreateCustomerDto {
  @IsString()
  name: string;

  @IsString()
  lastName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterestedProjectEntryDto)
  interestedProjects?: InterestedProjectEntryDto[];

  @IsOptional()
  @IsString()
  assignedTo?: string;
  @IsOptional()
  @IsBoolean()
  isReferral?: boolean;

  @IsOptional()
  @IsBoolean()
  isInternational?: boolean;
}
