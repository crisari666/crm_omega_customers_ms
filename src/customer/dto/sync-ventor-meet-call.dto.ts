import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MeetSyncUtteranceDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  speaker?: string;

  @IsString()
  @MaxLength(8000)
  text: string;

  @IsOptional()
  @Type(() => Number)
  start?: number;

  @IsOptional()
  @Type(() => Number)
  end?: number;
}

export class SyncVentorMeetCallDto {
  @IsIn(['attended', 'no_answer'])
  attendance: 'attended' | 'no_answer';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  conferenceRecordName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  transcript?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => MeetSyncUtteranceDto)
  utterances?: MeetSyncUtteranceDto[];

  @IsOptional()
  @IsISO8601()
  endedAt?: string;
}
