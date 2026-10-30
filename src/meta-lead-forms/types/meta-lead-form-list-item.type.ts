import type { MetaLeadFormFlowStrategy } from './meta-lead-form-flow-strategy.type';

export type MetaLeadFormListItem = {
  readonly id: string;
  readonly formId: string;
  readonly formName: string;
  readonly flowStrategy: MetaLeadFormFlowStrategy;
  readonly enabled: boolean;
  readonly notes: string;
  readonly createdByOfficeUserId?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
};

export type MetaLeadFormSettingsView = {
  readonly outboundDelayMinutes: number;
};
