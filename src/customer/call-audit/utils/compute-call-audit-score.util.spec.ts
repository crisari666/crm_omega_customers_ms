import {
  buildScoredIndicator,
  computeCallAuditScoreTotals,
} from './compute-call-audit-score.util';

describe('computeCallAuditScoreTotals', () => {
  it('sums earned and max points', () => {
    expect(
      computeCallAuditScoreTotals([
        { pointsEarned: 10, maxPoints: 10 },
        { pointsEarned: 0, maxPoints: 20 },
        { pointsEarned: 15, maxPoints: 15 },
      ]),
    ).toEqual({ totalScore: 25, maxScore: 45 });
  });
});

describe('buildScoredIndicator', () => {
  it('awards full points when passed', () => {
    expect(
      buildScoredIndicator({
        configIndicator: {
          key: 'saludo',
          label: 'Saludo',
          description: 'd',
          maxPoints: 10,
        },
        passed: true,
        rationale: 'ok',
      }),
    ).toEqual({
      key: 'saludo',
      label: 'Saludo',
      passed: true,
      maxPoints: 10,
      pointsEarned: 10,
      rationale: 'ok',
      evidence: undefined,
    });
  });

  it('awards zero when failed', () => {
    const actual = buildScoredIndicator({
      configIndicator: {
        key: 'cierre',
        label: 'Cierre',
        description: 'd',
        maxPoints: 15,
      },
      passed: false,
    });
    expect(actual.pointsEarned).toBe(0);
    expect(actual.maxPoints).toBe(15);
  });
});
