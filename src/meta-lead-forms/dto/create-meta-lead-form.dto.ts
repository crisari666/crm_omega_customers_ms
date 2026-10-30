import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import {
  META_LEAD_FORM_FLOW_STRATEGIES,
  type MetaLeadFormFlowStrategy,
} from '../types/meta-lead-form-flow-strategy.type';

export class CreateMetaLeadFormDto {
  @IsString()
  @MinLength(1)
  formId: string;

  @IsString()
  @MinLength(1)
  formName: string;

  @IsIn(META_LEAD_FORM_FLOW_STRATEGIES)
  flowStrategy: MetaLeadFormFlowStrategy;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
