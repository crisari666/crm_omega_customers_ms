import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

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

  /** Initial CRM note — creates a `CustomerDescription` and links it on the customer. */
  @IsOptional()
  @ValidateIf((_, v: string | undefined) => v !== undefined && v !== '')
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  note?: string;

  /** Adds one entry to `interestedProjects` (same shape as create `interestedProjects[].projectId`). */
  @IsOptional()
  @IsString()
  projectId?: string;
}
