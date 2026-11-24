import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { LEAD_MAX_SEARCH_LENGTH } from '../constants/lead-assistant.constants';
import { LEAD_FAQ_CATEGORIES, type LeadFaqCategory } from '../types/lead-faq-category.type';

/** Filters of the FAQ list. */
export class ListLeadFaqsQueryDto {
  @IsOptional()
  @IsIn(LEAD_FAQ_CATEGORIES)
  category?: LeadFaqCategory;

  /** Only FAQs that have a project-specific answer for this project. */
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LEAD_MAX_SEARCH_LENGTH)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}
