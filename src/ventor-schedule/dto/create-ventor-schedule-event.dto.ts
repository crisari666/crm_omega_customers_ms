import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { VentorScheduleEventType } from '../schemas/ventor-schedule-event.schema';

export class CreateVentorScheduleEventDto {
  @IsString()
  customerId: string;

  /**
   * YYYY-MM-DD calendar day with `time`.
   * - `call`: America/Bogota wall → stored as true UTC
   * - visit/virtual/on_land: wall clock stored as UTC Date.UTC (ISO clock = display)
   */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  @IsString()
  date: string;

  /**
   * HH:mm 24h wall clock.
   * Same semantics as `date` for `call` (Bogota) vs visit types (wall-as-Z).
   */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'time must be HH:mm',
  })
  @IsString()
  time: string;

  @IsEnum(VentorScheduleEventType)
  eventType: VentorScheduleEventType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /**
   * Optional Meet invite for the customer. When omitted on virtual visits,
   * the service falls back to `Customer.email`.
   */
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  customerEmail?: string;

  /** Required when eventType is virtual — Meet invite for the ventor. */
  @ValidateIf((o: CreateVentorScheduleEventDto) => o.eventType === VentorScheduleEventType.Virtual)
  @IsEmail()
  @MaxLength(320)
  ventorEmail?: string;
}
