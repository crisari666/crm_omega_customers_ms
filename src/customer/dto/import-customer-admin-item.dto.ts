import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * One CSV row for admin bulk customer import.
 */
export class ImportCustomerAdminItemDto {
  @IsString()
  @MinLength(1)
  phone: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateIf((_, v: string | undefined) => v !== undefined && v !== '')
  @IsEmail()
  email?: string;

  /** Office user id stored as `assignedTo` when creating a new customer. */
  @IsOptional()
  @IsString()
  assignedTo?: string;
}
