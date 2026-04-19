import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Admin create: only phone is required; optional assignee via `user` (stored as assignedTo).
 */
export class CreateCustomerAdminDto {
  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @ValidateIf((_, v: string | undefined) => v !== undefined && v !== '')
  @IsEmail()
  email?: string;

  /** Office user id to assign (maps to `assignedTo` on the customer). */
  @IsOptional()
  @IsString()
  user?: string;
}
