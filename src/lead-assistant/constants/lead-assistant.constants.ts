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
/**
 * Minimum {@link scoreLeadFaqMatch} score to answer a FAQ when the LLM fails
 * (token/stem overlap band; full containment is >= 1000).
 */
export const LEAD_FAQ_FALLBACK_MIN_SCORE = 200 as const;
/** Min shared prefix length for stem-style FAQ token hits (e.g. escrituras ~ escrituracion). */
export const LEAD_FAQ_STEM_MIN_CHARS = 5 as const;
/**
 * Reverse containment (`phrase.includes(customer)`) only when the customer text
 * has at least this many tokens of length ≥ 3 — blocks short replies like
 * "Construir" from matching long FAQs that merely contain that word.
 */
export const LEAD_FAQ_REVERSE_CONTAINMENT_MIN_TOKENS = 2 as const;
/**
 * Reverse containment also requires customer length ≥ this fraction of the phrase
 * (avoids one long token matching a much longer FAQ question).
 */
export const LEAD_FAQ_REVERSE_CONTAINMENT_MIN_LENGTH_RATIO = 0.4 as const;
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
