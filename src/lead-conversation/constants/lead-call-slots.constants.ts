import type { LeadCallPeriod } from '../types/lead-call-period.type';

export const CALL_SLOT_MINUTES = 30 as const;
export const CALL_SLOT_MS = CALL_SLOT_MINUTES * 60 * 1000;
/** A slot is offered only when it starts at least this far in the future. */
export const MIN_SLOT_LEAD_MINUTES = 30 as const;
export const DEFAULT_CALL_SLOT_LOOKAHEAD_DAYS = 7 as const;
/** WhatsApp interactive list row limit. */
export const MAX_CALL_SLOT_OPTIONS = 10 as const;
/** America/Bogota has no DST: fixed UTC-5. */
export const BOGOTA_UTC_OFFSET_HOURS = -5 as const;
export const BOGOTA_TIME_ZONE = 'America/Bogota' as const;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Local (Bogota) hour windows; end hour is exclusive (last slot starts 30 min before). */
export const CALL_PERIOD_WINDOWS: Readonly<Record<LeadCallPeriod, { readonly startHour: number; readonly endHour: number }>> = {
  morning: { startHour: 9, endHour: 12 },
  afternoon: { startHour: 14, endHour: 17 },
  night: { startHour: 18, endHour: 21 },
};

export const CALL_SLOT_REPLY_PREFIX = 'callslot:' as const;
/** Mongo duplicate key error (unique pending call slot index). */
export const MONGO_DUPLICATE_KEY_CODE = 11000 as const;
