import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CUSTOMER_PAYMENT_METHODS } from '../constants/payment-method.constants';

/**
 * Multipart body fields for adding a fee under a down payment.
 */
export class CreateCustomerPaymentFeeMultipartDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  paymentValue: number;

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
}
