import type { CallAuditIndicatorResult } from '../types/customer-call-audit.type';

export type CallAuditIndicatorsSummary = {
  passed: number;
  total: number;
  failedLabels: string[];
};

/** Builds pass/fail counts and failed indicator labels for progress UI. */
export function buildCallAuditIndicatorsSummary(
  indicators: ReadonlyArray<Pick<CallAuditIndicatorResult, 'passed' | 'label'>>,
): CallAuditIndicatorsSummary {
  const total = indicators.length;
  let passed = 0;
  const failedLabels: string[] = [];
  for (const indicator of indicators) {
    if (indicator.passed === true) {
      passed += 1;
    } else {
      failedLabels.push(indicator.label);
    }
  }
  return { passed, total, failedLabels };
}
