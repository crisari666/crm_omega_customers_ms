import type { LeadTemplateBindingSource } from '../../lead-conversation/types/lead-template-binding.type';

/** Singleton key of the assistant settings document. */
export const LEAD_ASSISTANT_SETTINGS_KEY = 'default' as const;
/** Singleton key of the recovery sequence document. */
export const LEAD_RECOVERY_SEQUENCE_KEY = 'default' as const;
export const LEAD_ASSISTANT_DEFAULT_NAME = 'Verónica' as const;
export const LEAD_ASSISTANT_DEFAULT_GREETING =
  'Hola {{customerName}}, soy {{assistantName}}, asistente virtual comercial de {{businessName}}.' as const;
export const LEAD_REPLY_DEBOUNCE_DEFAULT_SECONDS = 4 as const;
export const LEAD_REPLY_DEBOUNCE_MIN_SECONDS = 0 as const;
export const LEAD_REPLY_DEBOUNCE_MAX_SECONDS = 15 as const;
/** Maximum number of FAQs handed to the agent per turn. */
export const LEAD_FAQ_RESOLVE_CAP = 60 as const;
/** In-memory cache lifetime of the approved templates list. */
export const LEAD_TEMPLATES_CACHE_TTL_MS = 5 * 60 * 1000;
export const LEAD_RECOVERY_MIN_OFFSET_HOURS = 1 as const;
export const LEAD_RECOVERY_MAX_OFFSET_HOURS = 720 as const;
export const MS_PER_HOUR = 3_600_000 as const;
export const LEAD_UNANSWERED_DEFAULT_LIMIT = 20 as const;
export const LEAD_UNANSWERED_MAX_LIMIT = 100 as const;
export const LEAD_MAX_SEARCH_LENGTH = 80 as const;
/** Fallback used when a template variable resolves to an empty value. */
export const LEAD_TEMPLATE_EMPTY_VALUE = '-' as const;
export const LEAD_TEMPLATE_DEFAULT_FIRST_NAME = 'Cliente' as const;
export const LEAD_TEMPLATE_BINDING_SOURCES: readonly LeadTemplateBindingSource[] = [
  'customer_first_name',
  'assistant_name',
  'business_name',
  'project_title',
  'static',
];
