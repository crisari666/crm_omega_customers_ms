import type {
  CallAuditAiReviewItemDto,
  CallAuditAiReviewSummaryDto,
} from '../types/customer-call-audit.type';
import { buildCallAuditIndicatorsSummary } from './build-call-audit-indicators-summary.util';

const TOP_FAILED_LIMIT = 3;

/** Aggregates AI review list into month KPIs (call-date-filtered set). */
export function buildCallAuditAiReviewSummary(
  items: readonly CallAuditAiReviewItemDto[],
): CallAuditAiReviewSummaryDto {
  let aiCompleted = 0;
  let aiPending = 0;
  let aiFailed = 0;
  let aiNone = 0;
  let interestSum = 0;
  let interestCount = 0;
  const failedCounts = new Map<string, number>();
  for (const item of items) {
    switch (item.aiStatus) {
      case 'completed':
        aiCompleted += 1;
        if (item.ai !== null && item.ai.status === 'completed') {
          interestSum += item.ai.interestScore;
          interestCount += 1;
          const summary = buildCallAuditIndicatorsSummary(item.ai.indicators);
          for (const label of summary.failedLabels) {
            failedCounts.set(label, (failedCounts.get(label) ?? 0) + 1);
          }
        }
        break;
      case 'pending':
        aiPending += 1;
        break;
      case 'failed':
        aiFailed += 1;
        break;
      default:
        aiNone += 1;
        break;
    }
  }
  const topFailedIndicators = Array.from(failedCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, TOP_FAILED_LIMIT);
  return {
    dateBasis: 'callCompletedAt',
    totalEligible: items.length,
    aiCompleted,
    aiPending,
    aiFailed,
    aiNone,
    avgInterestScore:
      interestCount > 0 ? Math.round((interestSum / interestCount) * 10) / 10 : null,
    topFailedIndicators,
  };
}
