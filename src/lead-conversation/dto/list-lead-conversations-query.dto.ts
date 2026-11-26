import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LEAD_CONVERSATION_STATUSES, type LeadConversationStatus } from '../types/lead-conversation-status.type';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadFlowVersion } from '../types/lead-flow-version.type';

const LEAD_FLOW_FILTERS = ['v1', 'v2'] as const;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 80;

/** Filters of the admin lead conversations list (`page` is 0-based). */
export class ListLeadConversationsQueryDto {
  @IsOptional()
  @IsIn(LEAD_CONVERSATION_STATUSES)
  status?: LeadConversationStatus;

  @IsOptional()
  @IsEnum(LeadConversationStep)
  step?: LeadConversationStep;

  /** Restricts the list to one flow generation (V1 scripted / V2 agent). */
  @IsOptional()
  @IsIn(LEAD_FLOW_FILTERS)
  flow?: LeadFlowVersion;

  /** Matches phone (waId), WhatsApp username, profile name or project title. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  /** When set, only sessions whose confirmed `projectId` matches. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  projectId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}
