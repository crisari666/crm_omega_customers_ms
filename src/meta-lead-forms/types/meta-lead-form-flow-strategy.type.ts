export const META_LEAD_FORM_FLOW_STRATEGIES = [
  'immediate_assign',
  'lead_conversation',
] as const;

export type MetaLeadFormFlowStrategy = (typeof META_LEAD_FORM_FLOW_STRATEGIES)[number];
