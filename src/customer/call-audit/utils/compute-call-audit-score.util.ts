import type { CallAuditLlmIndicatorConfig } from '../config/call-audit-llm.config';
import type { CallAuditIndicatorResult } from '../types/customer-call-audit.type';

export type CallAuditScoreTotals = {
  totalScore: number;
  maxScore: number;
};

/**
 * Builds a scored indicator row from pass/fail + config maxPoints.
 */
export function buildScoredIndicator(input: {
  readonly configIndicator: CallAuditLlmIndicatorConfig;
  readonly passed: boolean;
  readonly rationale?: string;
  readonly evidence?: string;
}): CallAuditIndicatorResult {
  const maxPoints = input.configIndicator.maxPoints;
  return {
    key: input.configIndicator.key,
    label: input.configIndicator.label,
    passed: input.passed,
    maxPoints,
    pointsEarned: input.passed ? maxPoints : 0,
    rationale: input.rationale,
    evidence: input.evidence,
  };
}

/**
 * Sums earned / max points for a scored indicator list.
 */
export function computeCallAuditScoreTotals(
  indicators: ReadonlyArray<Pick<CallAuditIndicatorResult, 'pointsEarned' | 'maxPoints'>>,
): CallAuditScoreTotals {
  let totalScore = 0;
  let maxScore = 0;
  for (const indicator of indicators) {
    totalScore += indicator.pointsEarned;
    maxScore += indicator.maxPoints;
  }
  return { totalScore, maxScore };
}
