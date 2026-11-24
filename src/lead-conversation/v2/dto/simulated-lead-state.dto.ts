import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { LeadConversationStep } from '../../types/lead-conversation-step.enum';
import { LEAD_CONVERSATION_STATUSES, type LeadConversationStatus } from '../../types/lead-conversation-status.type';
import { SimulatedLeadAnswersDto } from './simulated-lead-answers.dto';
import { SimulatedLeadProfileDto } from './simulated-lead-profile.dto';
import { SimulatedTranscriptMessageDto } from './simulated-transcript-message.dto';

/** In-memory conversation state the simulator client sends back on every turn. */
export class SimulatedLeadStateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsEnum(LeadConversationStep)
  step: LeadConversationStep;

  @IsIn(LEAD_CONVERSATION_STATUSES)
  status: LeadConversationStatus;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  projectTitle?: string;

  @ValidateNested()
  @Type(() => SimulatedLeadProfileDto)
  leadProfile: SimulatedLeadProfileDto;

  @IsArray()
  @IsString({ each: true })
  scoreSignals: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimulatedTranscriptMessageDto)
  transcript: SimulatedTranscriptMessageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SimulatedLeadAnswersDto)
  answers?: SimulatedLeadAnswersDto;
}
