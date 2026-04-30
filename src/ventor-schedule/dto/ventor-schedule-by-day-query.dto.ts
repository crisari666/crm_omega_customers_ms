import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { VENTOR_SCHEDULE_BY_DAY_VIEW } from './ventor-schedule-by-day-view.const';

const VENTOR_SCHEDULE_BY_DAY_VIEW_VALUES = [
  VENTOR_SCHEDULE_BY_DAY_VIEW.Self,
  VENTOR_SCHEDULE_BY_DAY_VIEW.MainLeadOnLand,
] as const;

export class VentorScheduleByDayQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  @IsString()
  date: string;

  @IsOptional()
  @IsIn(VENTOR_SCHEDULE_BY_DAY_VIEW_VALUES)
  view?: (typeof VENTOR_SCHEDULE_BY_DAY_VIEW_VALUES)[number];
}
