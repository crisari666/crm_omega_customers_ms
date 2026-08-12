import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CUSTOMER_PAYMENT_METHODS } from '../constants/payment-method.constants';

export class CreateCustomerPaymentDto {
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
  @IsIn(CUSTOMER_PAYMENT_METHODS, {
    message: `paymentMethod must be one of: ${CUSTOMER_PAYMENT_METHODS.join(', ')}`,
  })
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
