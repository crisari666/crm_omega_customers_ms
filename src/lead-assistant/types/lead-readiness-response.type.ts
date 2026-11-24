import type { LeadReadinessItem } from './lead-readiness-item.type';

export type LeadReadinessResponse = {
  readonly items: readonly LeadReadinessItem[];
  readonly readyCount: number;
  readonly total: number;
};
