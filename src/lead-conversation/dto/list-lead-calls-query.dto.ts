import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { VentorScheduleEventStatus } from '../../ventor-schedule/schemas/ventor-schedule-event.schema';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_USER_ID_LENGTH = 64;

/** Agenda range (Bogota calendar days, `to` inclusive) of lead call events. */
export class ListLeadCallsQueryDto {
  @Matches(DATE_REGEX, { message: 'from must be YYYY-MM-DD' })
  from: string;

  @Matches(DATE_REGEX, { message: 'to must be YYYY-MM-DD' })
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_USER_ID_LENGTH)
  userId?: string;

  @IsOptional()
  @IsEnum(VentorScheduleEventStatus)
  status?: VentorScheduleEventStatus;
}
