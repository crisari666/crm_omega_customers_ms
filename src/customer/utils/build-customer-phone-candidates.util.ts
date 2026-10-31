const CO_COUNTRY_CODE = '57';
const CO_MOBILE_NATIONAL_LENGTH = 10;
const CO_MOBILE_PREFIX = '3';

/**
 * Builds phone lookup variants for Colombia WhatsApp / Meta lead matching.
 * Covers `300…`, `57300…`, and `+57 300…` style inputs.
 */
export function buildCustomerPhoneCandidates(rawPhone: string): string[] {
  const trimmed = rawPhone.trim();
  const digits = trimmed.replace(/\D/g, '');
  const strippedPlusSpaces = trimmed.replace(/[+\s]+/g, '');
  const variants: string[] = [];
  const pushUnique = (value: string): void => {
    if (value.length === 0) return;
    if (!variants.includes(value)) variants.push(value);
  };
  pushUnique(trimmed);
  pushUnique(strippedPlusSpaces);
  pushUnique(digits);
  if (digits.length === 0) {
    return variants;
  }
  if (
    digits.length === CO_MOBILE_NATIONAL_LENGTH &&
    digits.startsWith(CO_MOBILE_PREFIX)
  ) {
    pushUnique(`${CO_COUNTRY_CODE}${digits}`);
  }
  if (
    digits.startsWith(CO_COUNTRY_CODE) &&
    digits.length === CO_COUNTRY_CODE.length + CO_MOBILE_NATIONAL_LENGTH
  ) {
    const national = digits.slice(CO_COUNTRY_CODE.length);
    if (national.startsWith(CO_MOBILE_PREFIX)) {
      pushUnique(national);
    }
  }
  return variants;
}
