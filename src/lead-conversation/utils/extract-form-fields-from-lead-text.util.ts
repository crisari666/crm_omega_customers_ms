export type LeadFormFieldsFromText = {
  readonly fullName?: string;
  readonly email?: string;
  readonly city?: string;
  /** Nearest catalog code like `10_20m`. */
  readonly economicCapacity?: string;
  /** True when the form says they seek another city / reject Carmen de Apicalá. */
  readonly rejectsSuggestedLocation?: boolean;
};

const FULL_NAME_PATTERN = /(?:Full\s*name|Nombre\s*completo|Nombre)\s*:\s*([^\n\r]+)/iu;
const EMAIL_PATTERN = /(?:Email|Correo(?:\s*electr[oó]nico)?)\s*:\s*([^\s\n\r]+@[^\s\n\r]+)/iu;
const CITY_PATTERN = /(?:City|Ciudad)\s*:\s*([^\n\r]+)/iu;
const PHONE_LABEL_SIGNAL = /(?:Phone\s*number|Tel[eé]fono|Celular)\s*:/iu;
const INVESTMENT_SIGNAL = /(?:disponible\s+para\s+invertir|invest)/iu;
const LOCATION_SIGNAL = /Carmen\s+de\s+Apical/iu;
const INSTANT_FORM_INTRO_SIGNAL = /(?:He\s+completado\s+el\s+formulario|Complet[eé]\s+el\s+formulario)/iu;
const INVESTMENT_RANGE_PATTERN =
  /(?:disponible\s+para\s+invertir|invest)[^:\n]*:\s*Entre\s*\$?\s*([\d.'’\s]+)\s*COP\s*y\s*\$?\s*([\d.'’\s]+)\s*COP/iu;
const LOCATION_REJECT_PATTERN =
  /(?:otra\s+ciudad|busco\s+(?:un\s+)?lote\s+en\s+otra|no\s*,?\s*busco|No,?\s+busco)/iu;
const LOCATION_AFFIRM_PATTERN = /(?:Si,?\s+y\s+me\s+gustar[ií]a|Sí,?\s+y\s+me\s+gustar[ií]a|Si\s*$|Sí\s*$)/imu;
const MIN_FORM_DUMP_SIGNALS = 2;
const ECONOMIC_CAPACITY_STEP_M = 10;
const ECONOMIC_CAPACITY_MAX_M = 240;

/** Pulls Instant Form / CTWA dump fields from free-form WhatsApp text. */
export function extractFormFieldsFromLeadText(text: string): LeadFormFieldsFromText {
  const fullName = text.match(FULL_NAME_PATTERN)?.[1]?.trim();
  const email = text.match(EMAIL_PATTERN)?.[1]?.trim().toLowerCase();
  const city = text.match(CITY_PATTERN)?.[1]?.trim();
  const economicCapacity = mapInvestmentRangeToCapacityCode(text);
  const rejectsSuggestedLocation = detectRejectsSuggestedLocation(text);
  return {
    ...(fullName && fullName.length > 0 ? { fullName } : {}),
    ...(email && email.includes('@') ? { email } : {}),
    ...(city && city.length > 0 ? { city } : {}),
    ...(economicCapacity !== undefined ? { economicCapacity } : {}),
    ...(rejectsSuggestedLocation !== undefined ? { rejectsSuggestedLocation } : {}),
  };
}

/**
 * True when the inbound text looks like a Meta Instant Form / CTWA redirect dump
 * (not a free-form qualification reply).
 */
export function isInstantFormDump(text: string): boolean {
  const signals = [
    FULL_NAME_PATTERN.test(text),
    EMAIL_PATTERN.test(text),
    PHONE_LABEL_SIGNAL.test(text),
    INVESTMENT_SIGNAL.test(text),
    LOCATION_SIGNAL.test(text),
    INSTANT_FORM_INTRO_SIGNAL.test(text),
  ];
  return signals.filter(Boolean).length >= MIN_FORM_DUMP_SIGNALS;
}

/** Maps a COP investment range string into the nearest `N_Mm` catalog bucket. */
export function mapInvestmentRangeToCapacityCode(text: string): string | undefined {
  const match = text.match(INVESTMENT_RANGE_PATTERN);
  if (!match) return undefined;
  const fromM = parseCopToMillions(match[1] ?? '');
  const toM = parseCopToMillions(match[2] ?? '');
  if (fromM === undefined || toM === undefined) return undefined;
  const mid = (fromM + toM) / 2;
  const bucketStart = Math.min(
    ECONOMIC_CAPACITY_MAX_M - ECONOMIC_CAPACITY_STEP_M,
    Math.max(0, Math.floor(mid / ECONOMIC_CAPACITY_STEP_M) * ECONOMIC_CAPACITY_STEP_M),
  );
  return `${bucketStart}_${bucketStart + ECONOMIC_CAPACITY_STEP_M}m`;
}

function parseCopToMillions(raw: string): number | undefined {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 0) return undefined;
  return Number(digits) / 1_000_000;
}

function detectRejectsSuggestedLocation(text: string): boolean | undefined {
  if (!LOCATION_SIGNAL.test(text) && !LOCATION_REJECT_PATTERN.test(text)) {
    return undefined;
  }
  if (LOCATION_REJECT_PATTERN.test(text)) return true;
  if (LOCATION_AFFIRM_PATTERN.test(text)) return false;
  return undefined;
}
