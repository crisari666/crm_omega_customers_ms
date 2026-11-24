import type { LeadTemplateRef } from '../../lead-conversation/types/lead-template-ref.type';

/** One follow-up message of the recovery sequence (template sent N hours after the last contact). */
export type LeadRecoveryStep = {
  readonly id: string;
  readonly label: string;
  readonly offsetHours: number;
  readonly enabled: boolean;
  readonly template: LeadTemplateRef;
  readonly sentCount: number;
  readonly repliedCount: number;
};
