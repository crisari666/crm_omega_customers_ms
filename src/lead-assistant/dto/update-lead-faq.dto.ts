import { PartialType } from '@nestjs/mapped-types';
import { CreateLeadFaqDto } from './create-lead-faq.dto';

/** Partial FAQ update; the merged result must still have an answer. */
export class UpdateLeadFaqDto extends PartialType(CreateLeadFaqDto) {}
