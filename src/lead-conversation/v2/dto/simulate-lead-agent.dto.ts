import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { LEAD_AGENT_SIMULATOR_MAX_MESSAGE_CHARS } from '../constants/lead-agent.constants';
import { SimulatedLeadStateDto } from './simulated-lead-state.dto';

/** Body of `POST admin/customer/lead-assistant/simulate`. */
export class SimulateLeadAgentDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SimulatedLeadStateDto)
  state?: SimulatedLeadStateDto;

  @IsString()
  @MinLength(1)
  @MaxLength(LEAD_AGENT_SIMULATOR_MAX_MESSAGE_CHARS)
  message: string;
}
