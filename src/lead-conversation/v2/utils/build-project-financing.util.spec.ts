import { buildProjectFinancing } from './build-project-financing.util';

describe('buildProjectFinancing', () => {
  it('computes monthly payments from lot price minus separation over installments', () => {
    const actual = buildProjectFinancing({
      lotOptions: [
        { area: 300, price: 51_000_000 },
        { area: 500, price: 68_000_000 },
        { area: 800, price: 84_000_000 },
      ],
      separation: 500_000,
      maxInstallments: 36,
    });
    expect(actual).toEqual({
      separation: 500_000,
      installments: 36,
      minMonthlyPayment: 1_403_000,
      plans: [
        { area: 300, price: 51_000_000, monthlyPayment: 1_403_000 },
        { area: 500, price: 68_000_000, monthlyPayment: 1_875_000 },
        { area: 800, price: 84_000_000, monthlyPayment: 2_320_000 },
      ],
    });
  });

  it('defaults installments to 36 when maxInstallments is missing', () => {
    const actual = buildProjectFinancing({
      lotOptions: [{ area: 300, price: 51_000_000 }],
      separation: 500_000,
      maxInstallments: undefined,
    });
    expect(actual?.installments).toBe(36);
    expect(actual?.plans[0]?.monthlyPayment).toBe(1_403_000);
  });

  it('uses the project maxInstallments when set (e.g. 10)', () => {
    const actual = buildProjectFinancing({
      lotOptions: [{ area: 300, price: 51_000_000 }],
      separation: 500_000,
      maxInstallments: 10,
    });
    expect(actual?.installments).toBe(10);
    expect(actual?.plans[0]?.monthlyPayment).toBe(5_050_000);
  });

  it('skips lots with price less than or equal to separation', () => {
    const actual = buildProjectFinancing({
      lotOptions: [
        { area: 100, price: 400_000 },
        { area: 300, price: 51_000_000 },
      ],
      separation: 500_000,
      maxInstallments: 36,
    });
    expect(actual?.plans).toHaveLength(1);
    expect(actual?.plans[0]?.area).toBe(300);
  });

  it('returns undefined when no lot qualifies', () => {
    expect(
      buildProjectFinancing({
        lotOptions: [{ area: 100, price: 400_000 }],
        separation: 500_000,
        maxInstallments: 36,
      }),
    ).toBeUndefined();
    expect(
      buildProjectFinancing({
        lotOptions: [],
        separation: 0,
        maxInstallments: 36,
      }),
    ).toBeUndefined();
  });

  it('dedupes by area keeping the lowest price and sorts by area', () => {
    const actual = buildProjectFinancing({
      lotOptions: [
        { area: 500, price: 70_000_000 },
        { area: 300, price: 55_000_000 },
        { area: 300, price: 51_000_000 },
      ],
      separation: 500_000,
      maxInstallments: 36,
    });
    expect(actual?.plans.map((plan) => plan.area)).toEqual([300, 500]);
    expect(actual?.plans[0]?.price).toBe(51_000_000);
  });
});
