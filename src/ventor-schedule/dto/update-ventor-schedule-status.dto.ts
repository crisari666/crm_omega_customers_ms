import { IsEnum } from 'class-validator';
import { VentorScheduleEventStatus } from '../schemas/ventor-schedule-event.schema';

export class UpdateVentorScheduleStatusDto {
  @IsEnum(VentorScheduleEventStatus)
  status: VentorScheduleEventStatus;
}
