import {
  DEFAULT_VENTOR_MINE_VISIBILITY_DAYS,
  resolveVentorMineVisibilityDays,
} from './resolve-ventor-mine-visibility-days.util';

describe('resolveVentorMineVisibilityDays', () => {
  it('returns default when step days are undefined', () => {
    expect(resolveVentorMineVisibilityDays(undefined)).toBe(
      DEFAULT_VENTOR_MINE_VISIBILITY_DAYS,
    );
  });

  it('returns default when step days are null or below 1', () => {
    expect(resolveVentorMineVisibilityDays(null)).toBe(
      DEFAULT_VENTOR_MINE_VISIBILITY_DAYS,
    );
    expect(resolveVentorMineVisibilityDays(0)).toBe(
      DEFAULT_VENTOR_MINE_VISIBILITY_DAYS,
    );
    expect(resolveVentorMineVisibilityDays(-5)).toBe(
      DEFAULT_VENTOR_MINE_VISIBILITY_DAYS,
    );
  });

  it('returns floored step days when valid', () => {
    expect(resolveVentorMineVisibilityDays(45)).toBe(45);
    expect(resolveVentorMineVisibilityDays(45.9)).toBe(45);
  });
});
