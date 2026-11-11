import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { META_LEAD_FORM_FLOW_STRATEGIES } from '../../meta-lead-forms/types/meta-lead-form-flow-strategy.type';

/**
 * Query for ventor × time assignment timeline.
 * Window filters change-log `createdAt` (assignment time); cursor loads older pages.
 */
export class ListAssignmentTimelineQueryDto {
  @IsDateString()
  dateFrom: string;

  @IsDateString()
  dateTo: string;

  @IsOptional()
  @IsString()
  ventorId?: string;

  @IsOptional()
  @IsIn([...META_LEAD_FORM_FLOW_STRATEGIES])
  flowStrategy?: (typeof META_LEAD_FORM_FLOW_STRATEGIES)[number];

  /** ISO timestamp: return events with assignedAt strictly before this (older page). */
  @IsOptional()
  @IsDateString()
  cursorBefore?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
