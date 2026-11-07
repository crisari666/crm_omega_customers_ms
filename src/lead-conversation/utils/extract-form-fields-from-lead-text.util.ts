export type LeadFormFieldsFromText = {
  readonly fullName?: string;
  readonly email?: string;
};

const FULL_NAME_PATTERN = /(?:Full\s*name|Nombre\s*completo|Nombre)\s*:\s*([^\n\r]+)/iu;
const EMAIL_PATTERN = /(?:Email|Correo(?:\s*electr[oó]nico)?)\s*:\s*([^\s\n\r]+@[^\s\n\r]+)/iu;
const PHONE_LABEL_SIGNAL = /(?:Phone\s*number|Tel[eé]fono|Celular)\s*:/iu;
const INVESTMENT_SIGNAL = /(?:disponible\s+para\s+invertir|invest)/iu;
const LOCATION_SIGNAL = /Carmen\s+de\s+Apical/iu;
const INSTANT_FORM_INTRO_SIGNAL = /He\s+completado\s+el\s+formulario/iu;
const MIN_FORM_DUMP_SIGNALS = 2;

/** Pulls common Instant Form / CTWA dump fields from free-form WhatsApp text. */
export function extractFormFieldsFromLeadText(text: string): LeadFormFieldsFromText {
  const fullName = text.match(FULL_NAME_PATTERN)?.[1]?.trim();
  const email = text.match(EMAIL_PATTERN)?.[1]?.trim().toLowerCase();
  return {
    ...(fullName && fullName.length > 0 ? { fullName } : {}),
    ...(email && email.includes('@') ? { email } : {}),
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
