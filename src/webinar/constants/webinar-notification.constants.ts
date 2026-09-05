/** Meta WhatsApp template for MasterClass registration confirmation (customers WABA). */
export const WEBINAR_REGISTRATION_TEMPLATE_NAME = 'webinar_notification_' as const;

export const WEBINAR_REGISTRATION_TEMPLATE_LANGUAGE = 'es' as const;

/**
 * Body parameter order for `webinar_notification_` (named Meta template vars).
 * `date_webinar_2` mirrors `date_webinar` (Meta does not allow repeating a parameter name).
 */
export const WEBINAR_REGISTRATION_BODY_PARAM_ORDER = [
  'day',
  'date_webinar',
  'date_webinar_2',
  'time',
  'link_webinar',
] as const;

export const WEBINAR_INGEST_ACTOR_ID = 'meta-webinar-lead-ingest' as const;
