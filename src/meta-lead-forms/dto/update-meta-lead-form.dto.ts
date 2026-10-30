import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import {
  META_LEAD_FORM_FLOW_STRATEGIES,
  type MetaLeadFormFlowStrategy,
} from '../types/meta-lead-form-flow-strategy.type';

export class UpdateMetaLeadFormDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  formId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  formName?: string;

  @IsOptional()
  @IsIn(META_LEAD_FORM_FLOW_STRATEGIES)
  flowStrategy?: MetaLeadFormFlowStrategy;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
