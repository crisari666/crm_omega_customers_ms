import {
  LEAD_FINANCING_DEFAULT_INSTALLMENTS,
  LEAD_FINANCING_ROUNDING_COP,
} from '../constants/lead-agent.constants';
import type { ProjectFinancingKnowledge, ProjectFinancingPlan } from '../types/project-financing-knowledge.type';

type LotOptionInput = {
  readonly area?: number;
  readonly price?: number;
};

/**
 * Builds financing knowledge from lot options, separation fee and max installments.
 * Dedupes by area (lowest price), sorts by area, skips lots with price <= separation.
 * Returns undefined when no lot qualifies.
 */
export function buildProjectFinancing(args: {
  readonly lotOptions: readonly LotOptionInput[] | undefined;
  readonly separation: number | undefined;
  readonly maxInstallments: number | undefined;
}): ProjectFinancingKnowledge | undefined {
  const separation = Math.max(0, args.separation ?? 0);
  const installments =
    typeof args.maxInstallments === 'number' && args.maxInstallments >= 1
      ? Math.floor(args.maxInstallments)
      : LEAD_FINANCING_DEFAULT_INSTALLMENTS;
  const byArea = new Map<number, { area: number; price: number }>();
  for (const row of args.lotOptions ?? []) {
    if (typeof row.area !== 'number' || typeof row.price !== 'number') continue;
    if (!Number.isFinite(row.area) || !Number.isFinite(row.price)) continue;
    if (row.price <= separation) continue;
    const existing = byArea.get(row.area);
    if (existing === undefined || row.price < existing.price) {
      byArea.set(row.area, { area: row.area, price: row.price });
    }
  }
  const plans: ProjectFinancingPlan[] = [...byArea.values()]
    .sort((a, b) => a.area - b.area)
    .map((lot) => ({
      area: lot.area,
      price: lot.price,
      monthlyPayment: roundMonthlyPayment((lot.price - separation) / installments),
    }));
  if (plans.length === 0) return undefined;
  const minMonthlyPayment = Math.min(...plans.map((plan) => plan.monthlyPayment));
  return { separation, installments, minMonthlyPayment, plans };
}

function roundMonthlyPayment(raw: number): number {
  return Math.ceil(raw / LEAD_FINANCING_ROUNDING_COP) * LEAD_FINANCING_ROUNDING_COP;
}
