import { buildCallAuditIndicatorsSummary } from './build-call-audit-indicators-summary.util';

describe('buildCallAuditIndicatorsSummary', () => {
  it('returns zero totals for empty indicators', () => {
    expect(buildCallAuditIndicatorsSummary([])).toEqual({
      passed: 0,
      total: 0,
      failedLabels: [],
    });
  });

  it('counts passed and collects failed labels', () => {
    const actual = buildCallAuditIndicatorsSummary([
      { label: 'Saludo', passed: true },
      { label: 'Cierre', passed: false },
      { label: 'Interés', passed: true },
    ]);
    expect(actual).toEqual({
      passed: 2,
      total: 3,
      failedLabels: ['Cierre'],
    });
  });
});
