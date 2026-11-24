import { IntersectionType, OmitType, PartialType, PickType } from '@nestjs/mapped-types';
import { CreateLeadFaqDto } from './create-lead-faq.dto';

class QuestionOverrideDto extends PartialType(PickType(CreateLeadFaqDto, ['question'] as const)) {}

class FaqFieldsDto extends OmitType(CreateLeadFaqDto, ['question'] as const) {}

/** FAQ body used to convert an unanswered question; `question` defaults to the asked text. */
export class ConvertLeadUnansweredQuestionDto extends IntersectionType(QuestionOverrideDto, FaqFieldsDto) {}
