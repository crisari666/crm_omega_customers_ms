import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { LEAD_FAQ_CATEGORIES, type LeadFaqCategory } from '../types/lead-faq-category.type';
import { LeadFaqProjectAnswerDto } from './lead-faq-project-answer.dto';

const MAX_PHRASINGS = 20;

/**
 * Creates a FAQ. Besides the field rules, the service requires `defaultAnswer`
 * or at least one `projectAnswers` entry.
 */
export class CreateLeadFaqDto {
  @IsString()
  @MinLength(1)
  question: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PHRASINGS)
  @IsString({ each: true })
  alternativePhrasings?: string[];

  @IsIn(LEAD_FAQ_CATEGORIES)
  category: LeadFaqCategory;

  @IsOptional()
  @IsString()
  defaultAnswer?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadFaqProjectAnswerDto)
  projectAnswers?: LeadFaqProjectAnswerDto[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
