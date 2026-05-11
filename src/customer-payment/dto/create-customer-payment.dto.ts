import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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
  @IsString()
  @MaxLength(100)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
