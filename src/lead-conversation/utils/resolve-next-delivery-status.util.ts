const FORWARD_DELIVERY_ORDER: readonly string[] = ['sent', 'delivered', 'read'];
const FAILED_STATUS = 'failed' as const;

/**
 * Decides the delivery status to store after a Meta status update.
 * Statuses only move forward (sent < delivered < read); `failed` is final.
 * Returns null when the update must be ignored (downgrade, duplicate or unknown status).
 */
export function resolveNextDeliveryStatus(current: string | undefined, incoming: string): string | null {
  if (current === FAILED_STATUS) return null;
  if (incoming === FAILED_STATUS) return FAILED_STATUS;
  const incomingRank = FORWARD_DELIVERY_ORDER.indexOf(incoming);
  if (incomingRank < 0) return null;
  const currentRank = current === undefined ? -1 : FORWARD_DELIVERY_ORDER.indexOf(current);
  return incomingRank > currentRank ? incoming : null;
}
