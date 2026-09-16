import { buildCallAuditIndicatorsSummary } from './build-call-audit-indicators-summary.util';

describe('buildCallAuditIndicatorsSummary', () => {
  it('returns zero totals for empty indicators', () => {
    expect(buildCallAuditIndicatorsSummary([])).toEqual({
      passed: 0,
      total: 0,
      failedLabels: [],
      earnedPoints: 0,
      maxPoints: 0,
      scorePercent: 0,
    });
  });

  it('counts passed points and collects failed labels', () => {
    const actual = buildCallAuditIndicatorsSummary([
      { label: 'Saludo', passed: true, pointsEarned: 10, maxPoints: 10 },
      { label: 'Cierre', passed: false, pointsEarned: 0, maxPoints: 15 },
      { label: 'Rapport', passed: true, pointsEarned: 10, maxPoints: 10 },
    ]);
    expect(actual).toEqual({
      passed: 2,
      total: 3,
      failedLabels: ['Cierre'],
      earnedPoints: 20,
      maxPoints: 35,
      scorePercent: 57.1,
    });
  });
});
