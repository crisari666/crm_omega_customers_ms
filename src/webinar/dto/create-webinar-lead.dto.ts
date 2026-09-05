import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateWebinarLeadDto {
  @IsMongoId()
  webinarEventId: string;

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

  /** When true (default), send WhatsApp registration template if Meet link exists. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'false' || value === false) {
      return false;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    return value;
  })
  @IsBoolean()
  sendNotification?: boolean;
}
