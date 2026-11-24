import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { LEAD_AGENT_CALL_PERIODS, LEAD_AGENT_PAYMENT_METHODS } from '../constants/lead-agent.constants';
import type { LeadConversationAnswers } from '../../types/lead-conversation-answers.type';

/** Answers of the simulated conversation (payment, lot range, call period and date). */
export class SimulatedLeadAnswersDto implements LeadConversationAnswers {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  rangoLote?: string;

  @IsOptional()
  @IsIn(LEAD_AGENT_PAYMENT_METHODS)
  formaPago?: LeadConversationAnswers['formaPago'];

  @IsOptional()
  @IsIn(LEAD_AGENT_CALL_PERIODS)
  horarioLlamada?: LeadConversationAnswers['horarioLlamada'];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  fechaLlamada?: string;
}
