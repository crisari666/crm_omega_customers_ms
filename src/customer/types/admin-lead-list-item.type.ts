import type { CustomerLeadSource } from './customer-lead-source.type';
import type { CustomerLifecycleStatus } from './customer-lifecycle-status.type';

export type AdminLeadSessionSummary = {
  readonly sessionId: string;
  readonly status: string;
  readonly score?: number;
  readonly priority?: number;
  readonly step?: string;
};

export type AdminLeadListItem = {
  readonly id: string;
  readonly name: string;
  readonly lastName: string;
  readonly phone: string;
  readonly lifecycleStatus: CustomerLifecycleStatus;
  readonly leadSources: readonly CustomerLeadSource[];
  readonly isPromoted: boolean;
  readonly assignedTo?: string;
  readonly metaLeadgenId?: string;
  readonly createdAt: string;
  readonly leadSession?: AdminLeadSessionSummary;
};

export type AdminLeadListPage = {
  readonly items: readonly AdminLeadListItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
};
