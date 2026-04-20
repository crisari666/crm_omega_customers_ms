/** Trim and remove whitespace so `phone` / `whatsapp` store one canonical string. */
export function normalizeCustomerPhone(value: string): string {
  return value.trim().replace(/\s+/g, '');
}
