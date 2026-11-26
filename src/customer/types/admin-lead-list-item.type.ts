import type { CustomerLeadSource } from './customer-lead-source.type';
import type { CustomerLifecycleStatus } from './customer-lifecycle-status.type';

export type AdminLeadSessionSummary = {
  readonly sessionId: string;
  readonly status: string;
  readonly score?: number;
  readonly priority?: number;
  readonly step?: string;
  /** 6 for the V1 scripted flow, 100 for the V2 agent flow. */
  readonly maxScore: number;
  readonly flowVersion: 'v1' | 'v2';
  /** V2 only. */
  readonly temperature?: string;
};

/** Next upcoming pending call for this customer (leads inbox / chat drawer). */
export type AdminLeadScheduledCall = {
  readonly eventId: string;
  readonly scheduledAt: string;
  readonly status: string;
  readonly ventorName?: string;
  readonly note?: string;
};

export type AdminLeadListItem = {
  readonly id: string;
  readonly name: string;
  readonly lastName: string;
  readonly phone: string;
  readonly whatsappUsername?: string;
  readonly lifecycleStatus: CustomerLifecycleStatus;
  readonly leadSources: readonly CustomerLeadSource[];
  readonly isPromoted: boolean;
  readonly assignedTo?: string;
  readonly metaLeadgenId?: string;
  /** Meta Lead Ads form id from linked `meta_lead_campaigns` row. */
  readonly metaFormId?: string;
  /** Meta Lead Ads form name from linked campaign. */
  readonly metaFormName?: string;
  readonly createdAt: string;
  readonly leadSession?: AdminLeadSessionSummary;
  readonly scheduledCall?: AdminLeadScheduledCall;
  /** Project ids of interest (titles resolved by admin UI from RAG catalog). */
  readonly interestedProjects?: readonly { readonly projectId: string }[];
};

export type AdminLeadListPage = {
  readonly items: readonly AdminLeadListItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
};
