import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { VentorScheduleEventType } from '../schemas/ventor-schedule-event.schema';

export class CreateVentorScheduleEventDto {
  @IsString()
  customerId: string;

  /** YYYY-MM-DD (interpreted as UTC calendar day with `time` for `scheduledAt`). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  date: string;

  /** HH:mm 24h */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'time must be HH:mm',
  })
  time: string;

  @IsEnum(VentorScheduleEventType)
  eventType: VentorScheduleEventType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
