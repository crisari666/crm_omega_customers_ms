import { IsString, MinLength } from 'class-validator';

/** Project-specific answer of a FAQ. */
export class LeadFaqProjectAnswerDto {
  @IsString()
  @MinLength(1)
  projectId: string;

  @IsString()
  projectTitle: string;

  @IsString()
  @MinLength(1)
  answer: string;
}
