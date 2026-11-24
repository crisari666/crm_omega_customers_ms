import { normalizeLeadText } from '../../utils/normalize-lead-text.util';
import type { LeadProfile } from '../../types/lead-profile.type';

type LeadPaymentMethod = NonNullable<LeadProfile['paymentMethod']>;

const FINANCED_STEMS = ['financiado', 'financiar', 'financiacion', 'credito', 'cuotas'] as const;
const CASH_STEMS = ['contado', 'de contado', 'efectivo', 'pago unico', 'pago total'] as const;

/**
 * Parses free-text payment preference when the customer wrote instead of tapping.
 * Prefers the newest pending text. Returns undefined when neither financed nor cash is clear.
 */
export function parseLeadPaymentFromPending(
  pendingTexts: readonly string[],
): LeadPaymentMethod | undefined {
  for (let index = pendingTexts.length - 1; index >= 0; index -= 1) {
    const parsed = parseLeadPaymentReply(pendingTexts[index] ?? '');
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

/** Parses one customer message for financed vs cash. */
export function parseLeadPaymentReply(text: string): LeadPaymentMethod | undefined {
  const normalized = normalizeLeadText(text);
  if (normalized.length === 0) return undefined;
  if (CASH_STEMS.some((stem) => normalized.includes(stem))) return 'cash';
  if (FINANCED_STEMS.some((stem) => normalized.includes(stem))) return 'financed';
  return undefined;
}
