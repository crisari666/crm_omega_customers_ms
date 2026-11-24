/** One lot size with its computed monthly installment. */
export type ProjectFinancingPlan = {
  readonly area: number;
  readonly price: number;
  readonly monthlyPayment: number;
};

/**
 * Pre-computed financing facts for the V2 agent.
 * monthlyPayment = ceil((price - separation) / installments / rounding) * rounding.
 */
export type ProjectFinancingKnowledge = {
  readonly separation: number;
  readonly installments: number;
  readonly minMonthlyPayment: number;
  readonly plans: readonly ProjectFinancingPlan[];
};
