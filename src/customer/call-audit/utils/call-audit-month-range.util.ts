const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Returns inclusive UTC instants for calendar month bounds in a fixed offset (e.g. Colombia -05:00).
 */
export function getCallAuditMonthRange(
  month: string,
  utcOffset: string,
): { from: Date; to: Date } {
  if (!MONTH_PATTERN.test(month)) {
    throw new Error('month must be YYYY-MM');
  }
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const mon = Number(monthStr);
  const lastDay = new Date(year, mon, 0).getDate();
  const mm = monthStr.padStart(2, '0');
  const from = new Date(`${yearStr}-${mm}-01T00:00:00.000${utcOffset}`);
  const to = new Date(
    `${yearStr}-${mm}-${String(lastDay).padStart(2, '0')}T23:59:59.999${utcOffset}`,
  );
  return { from, to };
}

export function getDefaultCallAuditMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
