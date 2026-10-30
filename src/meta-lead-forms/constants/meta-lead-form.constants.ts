export const DEFAULT_OUTBOUND_DELAY_MINUTES = 2 as const;
export const MIN_OUTBOUND_DELAY_MINUTES = 1 as const;
export const META_LEAD_FORM_SETTINGS_KEY = 'default' as const;

export const META_LEAD_FORM_QUALIFICATION_QUEUE = 'meta-lead-form-qualification' as const;
export const META_LEAD_FORM_QUALIFICATION_JOB = 'delayed-outbound' as const;

export const DEFAULT_LEAD_FORM_TEMPLATE_NAME = 'lead_conversation_welcome' as const;
export const DEFAULT_LEAD_FORM_TEMPLATE_LANGUAGE = 'es' as const;

export function buildMetaLeadFormQualificationJobId(phoneDigits: string): string {
  const normalized = phoneDigits.replace(/\D/g, '');
  return `meta-lead-form-qual-${normalized}`;
}
