import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { LeadTemplateBindingSource } from '../../lead-conversation/types/lead-template-binding.type';
import { LEAD_TEMPLATE_BINDING_SOURCES } from '../constants/lead-assistant.constants';

/** Maps one template variable to a value source. */
export class LeadTemplateBindingDto {
  @IsString()
  @MinLength(1)
  variable: string;

  @IsIn(['header', 'body'])
  component: 'header' | 'body';

  @IsIn(['named', 'positional'])
  format: 'named' | 'positional';

  @IsIn(LEAD_TEMPLATE_BINDING_SOURCES)
  source: LeadTemplateBindingSource;

  @IsOptional()
  @IsString()
  staticValue?: string;
}
