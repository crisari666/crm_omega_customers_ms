/**
 * Call date for audit month filtering: Twilio completed event, else call-log createdAt.
 */
export function resolveCallAuditCallDateIso(
  completedAt?: string,
  createdAt?: Date | string,
): string | undefined {
  const completed = completedAt?.trim();
  if (completed !== undefined && completed !== '') {
    return completed;
  }
  if (createdAt === undefined) {
    return undefined;
  }
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return undefined;
  }
  return created.toISOString();
}

/** True when instant is within inclusive [from, to] month bounds. */
export function isInstantInCallAuditMonth(
  iso: string | undefined,
  from: Date,
  to: Date,
): boolean {
  if (iso === undefined) {
    return false;
  }
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return false;
  }
  const ms = instant.getTime();
  return ms >= from.getTime() && ms <= to.getTime();
}

const PREFETCH_PADDING_MS = 7 * 24 * 60 * 60 * 1000;

/** Widens Mongo createdAt prefetch so calls with completedAt in-month are not missed. */
export function widenCallAuditPrefetchRange(from: Date, to: Date): {
  from: Date;
  to: Date;
} {
  return {
    from: new Date(from.getTime() - PREFETCH_PADDING_MS),
    to: new Date(to.getTime() + PREFETCH_PADDING_MS),
  };
}
