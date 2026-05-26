import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SubmitHumanCallAuditIndicatorDto {
  @IsString()
  @MaxLength(64)
  key: string;

  @IsBoolean()
  passed: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rationale?: string;
}

export class SubmitHumanCallAuditSpeakerTurnDto {
  @IsString()
  @MaxLength(16)
  role: string;

  @IsString()
  @MaxLength(8000)
  text: string;
}

export class SubmitHumanCallAuditDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitHumanCallAuditIndicatorDto)
  indicators: SubmitHumanCallAuditIndicatorDto[];

  @IsInt()
  @Min(1)
  interestScore: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  interestScoreRationale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reviewerNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitHumanCallAuditSpeakerTurnDto)
  speakerTurns?: SubmitHumanCallAuditSpeakerTurnDto[];
}
