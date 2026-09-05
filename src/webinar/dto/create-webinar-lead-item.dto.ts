import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * One row for webinar lead bulk import (CSV/Excel).
 */
export class CreateWebinarLeadItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string' && value.trim() === '') {
      return undefined;
    }
    return value;
  })
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(7)
  phone: string;
}
