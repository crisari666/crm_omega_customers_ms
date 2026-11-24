import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { LEAD_UNANSWERED_MAX_LIMIT } from '../constants/lead-assistant.constants';
import {
  LEAD_UNANSWERED_QUESTION_STATUSES,
  type LeadUnansweredQuestionStatus,
} from '../types/lead-unanswered-question-status.type';

/** Filters of the unanswered questions list (`page` is 0-based). */
export class ListLeadUnansweredQuestionsQueryDto {
  @IsOptional()
  @IsIn(LEAD_UNANSWERED_QUESTION_STATUSES)
  status?: LeadUnansweredQuestionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LEAD_UNANSWERED_MAX_LIMIT)
  limit?: number;
}
