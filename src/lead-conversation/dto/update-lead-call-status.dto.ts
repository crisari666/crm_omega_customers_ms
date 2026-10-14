import { IsIn } from 'class-validator';
import { VentorScheduleEventStatus } from '../../ventor-schedule/schemas/ventor-schedule-event.schema';

const EDITABLE_STATUSES = [VentorScheduleEventStatus.Done, VentorScheduleEventStatus.Cancelled] as const;

export class UpdateLeadCallStatusDto {
  @IsIn(EDITABLE_STATUSES)
  status: (typeof EDITABLE_STATUSES)[number];
}
