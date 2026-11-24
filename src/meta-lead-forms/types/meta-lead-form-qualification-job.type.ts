import type { MetaLeadFormFlowStrategy } from './meta-lead-form-flow-strategy.type';

export type MetaLeadFormQualificationJobData = {
  readonly leadgenId: string;
  readonly customerId: string;
  readonly phone: string;
  readonly contactName: string;
  /** Registry flow of the form; `lead_conversation_v2` sends the agent welcome template. */
  readonly flowStrategy?: MetaLeadFormFlowStrategy;
  /** Meta form id that originated the lead. */
  readonly formId?: string;
};
