import { Type } from 'class-transformer';
import { IsArray, IsString, MinLength, ValidateNested } from 'class-validator';
import { LeadTemplateBindingDto } from './lead-template-binding.dto';

/** Approved WhatsApp template plus its variable bindings. */
export class LeadTemplateRefDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  language: string;

  @IsString()
  @MinLength(1)
  bodyText: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadTemplateBindingDto)
  bindings: LeadTemplateBindingDto[];
}
