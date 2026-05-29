const UNIX_SECONDS_THRESHOLD = 1_000_000_000_000;

/**
 * Meta WhatsApp webhooks send `timestamp` as Unix seconds (string or number), not ISO.
 */
export function parseMetaWebhookTimestampToDate(
  value: string | number | undefined,
): Date {
  if (value === undefined || value === null) {
    return new Date();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < UNIX_SECONDS_THRESHOLD ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }
  const trimmed = String(value).trim();
  if (trimmed === '') {
    return new Date();
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    const ms = numeric < UNIX_SECONDS_THRESHOLD ? numeric * 1000 : numeric;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }
  const isoDate = new Date(trimmed);
  return Number.isNaN(isoDate.getTime()) ? new Date() : isoDate;
}
