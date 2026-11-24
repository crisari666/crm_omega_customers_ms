import { IsIn } from 'class-validator';

/** Only dismissing is allowed; converting goes through the `convert` endpoint. */
export class UpdateLeadUnansweredQuestionDto {
  @IsIn(['dismissed'])
  status: 'dismissed';
}
