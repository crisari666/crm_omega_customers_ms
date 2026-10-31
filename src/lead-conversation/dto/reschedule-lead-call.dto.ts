import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const MAX_USER_ID_LENGTH = 64;
const DATE_YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HM_REGEX = /^\d{2}:\d{2}$/;

/**
 * Bogota wall date + 30-min time for admin reschedule.
 * Optional `userId` — omit to keep current ventor when free, else least-loaded free.
 */
export class RescheduleLeadCallDto {
  @IsString()
  @Matches(DATE_YMD_REGEX)
  date: string;

  @IsString()
  @Matches(TIME_HM_REGEX)
  time: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_USER_ID_LENGTH)
  userId?: string;
}
