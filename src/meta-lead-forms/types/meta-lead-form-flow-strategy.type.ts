export const META_LEAD_FORM_FLOW_STRATEGIES = [
  'immediate_assign',
  'lead_conversation',
  'lead_conversation_v2',
] as const;

export type MetaLeadFormFlowStrategy = (typeof META_LEAD_FORM_FLOW_STRATEGIES)[number];
