import { isSendableLeadPhone, isSyntheticLeadWaId } from './lead-identity-key.util';

/** Prefer `@username` when phone/waId is synthetic or missing; otherwise the sendable phone. */
export function formatLeadContactDisplay(input: {
  readonly phone?: string;
  readonly waId?: string;
  readonly whatsappUsername?: string;
}): string {
  const username = input.whatsappUsername?.trim().replace(/^@+/u, '');
  const phone = (input.phone ?? input.waId ?? '').trim();
  if (username && (!phone || isSyntheticLeadWaId(phone) || !isSendableLeadPhone(phone))) {
    return `@${username}`;
  }
  return phone;
}
