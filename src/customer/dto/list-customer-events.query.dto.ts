import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CUSTOMER_EVENT_TYPES, type CustomerEventType } from '../schemas/customer-event.schema';

export class ListCustomerEventsQueryDto {
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn(CUSTOMER_EVENT_TYPES)
  eventType?: CustomerEventType;

  @IsOptional()
  @IsString()
  officeId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([100, 200, 500])
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  skip?: number;
}
