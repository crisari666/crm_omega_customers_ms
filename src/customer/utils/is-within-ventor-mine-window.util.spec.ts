import { isWithinVentorMineWindow } from './is-within-ventor-mine-window.util';

describe('isWithinVentorMineWindow', () => {
  const now = new Date('2026-10-31T12:00:00.000Z');

  it('always includes prospects', () => {
    const actual = isWithinVentorMineWindow({
      isProspect: true,
      effectiveDate: new Date('2020-01-01T00:00:00.000Z'),
      windowDays: 30,
      now,
    });
    expect(actual).toBe(true);
  });

  it('includes when effective date is inside the default 30-day window', () => {
    const actual = isWithinVentorMineWindow({
      effectiveDate: new Date('2026-10-10T12:00:00.000Z'),
      windowDays: 30,
      now,
    });
    expect(actual).toBe(true);
  });

  it('excludes when effective date is outside the default 30-day window', () => {
    const actual = isWithinVentorMineWindow({
      effectiveDate: new Date('2026-09-01T12:00:00.000Z'),
      windowDays: 30,
      now,
    });
    expect(actual).toBe(false);
  });

  it('keeps older assignments when step window is 45 days', () => {
    const actual = isWithinVentorMineWindow({
      effectiveDate: new Date('2026-09-20T12:00:00.000Z'),
      windowDays: 45,
      now,
    });
    expect(actual).toBe(true);
  });
});
