import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsNumber, Max, Min } from 'class-validator';
import { CUSTOMER_EVENT_TYPES, type CustomerEventType } from '../schemas/customer-event.schema';

export class CreateCustomerEventDto {
  @IsIn(CUSTOMER_EVENT_TYPES)
  eventType: CustomerEventType;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
