/** Ingress / origin tags accumulated on a Customer (append-only). */
export const CUSTOMER_LEAD_SOURCES = [
  'meta_form',
  'whatsapp_lead_conversation',
  'whatsapp_inbound',
  'manual',
  'webinar',
] as const;

export type CustomerLeadSource = (typeof CUSTOMER_LEAD_SOURCES)[number];
