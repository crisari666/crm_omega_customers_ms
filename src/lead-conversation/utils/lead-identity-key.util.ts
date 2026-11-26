const META_WA_ID_PREFIX = 'meta:' as const;
const USERNAME_WA_ID_PREFIX = 'username:' as const;
const MIN_SENDABLE_PHONE_DIGITS = 7;

/** True when `waId` is digit-only and long enough for Meta Cloud API `to`. */
export function isSendableLeadPhone(waId: string): boolean {
  const digits = waId.replace(/\D/g, '');
  return digits.length >= MIN_SENDABLE_PHONE_DIGITS && digits === waId.trim();
}

/** True when `phone`/`waId` is a synthetic username-era identity key. */
export function isSyntheticLeadWaId(waId: string): boolean {
  const trimmed = waId.trim();
  return trimmed.startsWith(META_WA_ID_PREFIX) || trimmed.startsWith(USERNAME_WA_ID_PREFIX);
}

/** Builds a stable non-digit session/customer key for username-only Meta contacts. */
export function buildSyntheticLeadWaId(input: {
  readonly metaWhatsappUserId?: string;
  readonly whatsappUsername?: string;
}): string | undefined {
  const metaId = input.metaWhatsappUserId?.trim();
  if (metaId) return `${META_WA_ID_PREFIX}${metaId}`;
  const username = normalizeWhatsappUsername(input.whatsappUsername ?? '');
  if (username) return `${USERNAME_WA_ID_PREFIX}${username}`;
  return undefined;
}

/** Lowercase handle without leading `@`. */
export function normalizeWhatsappUsername(value: string): string {
  return value.trim().replace(/^@+/u, '').toLowerCase();
}
