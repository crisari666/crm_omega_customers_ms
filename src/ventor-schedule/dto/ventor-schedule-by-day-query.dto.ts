import { IsString, Matches } from 'class-validator';

export class VentorScheduleByDayQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  @IsString()
  date: string;
}
