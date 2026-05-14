import { Type } from 'class-transformer';
import {
  Allow,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Same fields as {@link CreateCustomerPaymentDto} for multipart form bodies.
 */
export class CreateCustomerPaymentMultipartDto {
  @IsString()
  customerId: string;

  @IsString()
  projectId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'paymentValue must be greater than zero' })
  paymentValue: number;

  @IsDateString()
  datePayment: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Multipart file field; consumed by Multer (`@UploadedFile()`), not validated here. */
  @Allow()
  evidence?: unknown;
}
