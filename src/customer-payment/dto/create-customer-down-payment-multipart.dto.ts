import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CUSTOMER_PAYMENT_METHODS } from '../constants/payment-method.constants';

/**
 * Multipart body fields for creating a down payment + first fee.
 */
export class CreateCustomerDownPaymentMultipartDto {
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lotNumber: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  expectedValue: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  firstPaymentValue: number;

  @IsDateString()
  datePayment: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiptNumber?: string;

  @IsOptional()
  @IsIn(CUSTOMER_PAYMENT_METHODS, {
    message: `paymentMethod must be one of: ${CUSTOMER_PAYMENT_METHODS.join(', ')}`,
  })
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectName?: string;
}
