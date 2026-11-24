import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import {
  LEAD_AGENT_EXPERIENCES,
  LEAD_AGENT_MAX_PROFILE_TEXT_CHARS,
  LEAD_AGENT_MEDIA_KINDS,
  LEAD_AGENT_MOTIVATIONS,
  LEAD_AGENT_PAYMENT_METHODS,
  LEAD_AGENT_TIMELINES,
} from '../constants/lead-agent.constants';
import type { LeadProfile, LeadProfileStage } from '../../types/lead-profile.type';

const LEAD_PROFILE_STAGES: readonly LeadProfileStage[] = ['opening', 'discovery', 'value', 'bridge', 'booking', 'booked'];

/** Lead profile round-tripped by the simulator client. */
export class SimulatedLeadProfileDto implements LeadProfile {
  @IsOptional()
  @IsIn(LEAD_PROFILE_STAGES)
  stage?: LeadProfileStage;

  @IsOptional()
  @IsInt()
  @Min(0)
  stageTurns?: number;

  @IsOptional()
  @IsIn(LEAD_AGENT_MOTIVATIONS)
  motivation?: LeadProfile['motivation'];

  @IsOptional()
  @IsIn(LEAD_AGENT_EXPERIENCES)
  experience?: LeadProfile['experience'];

  @IsOptional()
  @IsIn(LEAD_AGENT_PAYMENT_METHODS)
  paymentMethod?: LeadProfile['paymentMethod'];

  @IsOptional()
  @IsIn(LEAD_AGENT_TIMELINES)
  timeline?: LeadProfile['timeline'];

  @IsOptional()
  @IsString()
  @MaxLength(LEAD_AGENT_MAX_PROFILE_TEXT_CHARS)
  budget?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LEAD_AGENT_MAX_PROFILE_TEXT_CHARS)
  lotPreference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LEAD_AGENT_MAX_PROFILE_TEXT_CHARS)
  mainObjection?: string;

  @IsOptional()
  @IsArray()
  @IsIn(LEAD_AGENT_MEDIA_KINDS, { each: true })
  sentMedia?: LeadProfile['sentMedia'];
}
