import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { WebinarEventStatus } from '../schemas/webinar-event.schema';

export class CreateWebinarEventDto {
  @IsString()
  @MinLength(1)
  name: string;

  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;

  @IsOptional()
  @IsEnum(WebinarEventStatus)
  status?: WebinarEventStatus;
}
