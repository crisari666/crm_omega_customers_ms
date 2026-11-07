import { normalizeCustomerPhone } from '../../customer/utils/normalize-customer-phone.util';

const PHONE_LABEL_PATTERN =
  /(?:Phone\s*number|Tel[eé]fono|Celular|WhatsApp)\s*:\s*(\+?[\d\s().-]{7,})/iu;
const E164ISH_PATTERN = /\+?\d[\d\s().-]{6,}\d/u;
const MIN_PHONE_DIGITS = 7;

/** Digits-only phone from labeled CTWA/form lines, else first E.164-ish number in the body. */
export function extractPhoneFromLeadText(text: string): string | undefined {
  const labeled = text.match(PHONE_LABEL_PATTERN)?.[1];
  const labeledPhone = normalizeExtractedPhone(labeled);
  if (labeledPhone) return labeledPhone;
  const fallback = text.match(E164ISH_PATTERN)?.[0];
  return normalizeExtractedPhone(fallback);
}

function normalizeExtractedPhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const normalized = normalizeCustomerPhone(raw.replace(/[().-]/g, ''));
  if (normalized.length < MIN_PHONE_DIGITS || !/^\d+$/u.test(normalized)) return undefined;
  return normalized;
}
