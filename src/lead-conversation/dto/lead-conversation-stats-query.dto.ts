import { IsDateString } from 'class-validator';

/** Date range for admin lead-conversation session aggregates (`createdAt`). */
export class LeadConversationStatsQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
