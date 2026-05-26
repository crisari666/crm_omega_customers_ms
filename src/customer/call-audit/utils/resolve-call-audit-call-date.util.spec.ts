import {
  isInstantInCallAuditMonth,
  resolveCallAuditCallDateIso,
  widenCallAuditPrefetchRange,
} from './resolve-call-audit-call-date.util';
import { getCallAuditMonthRange } from './call-audit-month-range.util';

describe('resolveCallAuditCallDateIso', () => {
  it('prefers completedAt over createdAt', () => {
    expect(
      resolveCallAuditCallDateIso('2026-03-15T12:00:00.000Z', '2026-02-01T00:00:00.000Z'),
    ).toBe('2026-03-15T12:00:00.000Z');
  });

  it('falls back to createdAt when completedAt is missing', () => {
    const actual = resolveCallAuditCallDateIso(undefined, '2026-03-10T08:00:00.000Z');
    expect(actual).toBe(new Date('2026-03-10T08:00:00.000Z').toISOString());
  });
});

describe('isInstantInCallAuditMonth', () => {
  const { from, to } = getCallAuditMonthRange('2026-03', '-05:00');

  it('returns true for instant inside March 2026 Colombia', () => {
    expect(isInstantInCallAuditMonth('2026-03-15T17:00:00.000Z', from, to)).toBe(true);
  });

  it('returns false for instant outside month', () => {
    expect(isInstantInCallAuditMonth('2026-02-28T12:00:00.000Z', from, to)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isInstantInCallAuditMonth(undefined, from, to)).toBe(false);
  });
});

describe('widenCallAuditPrefetchRange', () => {
  it('extends bounds by 7 days', () => {
    const from = new Date('2026-03-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.999Z');
    const actual = widenCallAuditPrefetchRange(from, to);
    expect(actual.from.getTime()).toBe(from.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(actual.to.getTime()).toBe(to.getTime() + 7 * 24 * 60 * 60 * 1000);
  });
});
