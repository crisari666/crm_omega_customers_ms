export const LEAD_READINESS_KEYS = ['connection', 'identity', 'knowledge', 'recovery', 'activation'] as const;

export type LeadReadinessKey = (typeof LEAD_READINESS_KEYS)[number];

export type LeadReadinessStatus = 'ready' | 'attention' | 'missing';

/** One checklist row of the assistant readiness panel. */
export type LeadReadinessItem = {
  readonly key: LeadReadinessKey;
  readonly status: LeadReadinessStatus;
  readonly detail: string;
};
