import { buildCallAuditAiReviewSummary } from './build-call-audit-ai-review-summary.util';
import type { CallAuditAiReviewItemDto } from '../types/customer-call-audit.type';

function baseItem(
  overrides: Partial<CallAuditAiReviewItemDto>,
): CallAuditAiReviewItemDto {
  return {
    callLogId: '1',
    callSid: 'CA1',
    agentExternalRef: 'agent-1',
    hasTranscript: true,
    aiStatus: 'none',
    ai: null,
    ...overrides,
  };
}

describe('buildCallAuditAiReviewSummary', () => {
  it('returns empty aggregates for no items', () => {
    expect(buildCallAuditAiReviewSummary([])).toEqual({
      dateBasis: 'callCompletedAt',
      totalEligible: 0,
      aiCompleted: 0,
      aiPending: 0,
      aiFailed: 0,
      aiNone: 0,
      avgInterestScore: null,
      avgTotalScore: null,
      topFailedIndicators: [],
    });
  });

  it('counts statuses and averages interest and total score', () => {
    const items: CallAuditAiReviewItemDto[] = [
      baseItem({
        aiStatus: 'completed',
        ai: {
          id: 'a1',
          callLogId: '1',
          callSid: 'CA1',
          agentExternalRef: 'agent-1',
          source: 'ai',
          configVersion: 'v1',
          indicators: [
            {
              key: 'a',
              label: 'Apertura',
              passed: false,
              maxPoints: 10,
              pointsEarned: 0,
            },
            {
              key: 'b',
              label: 'Cierre',
              passed: true,
              maxPoints: 15,
              pointsEarned: 15,
            },
          ],
          totalScore: 15,
          maxScore: 25,
          interestScore: 4,
          status: 'completed',
          createdAt: '',
          updatedAt: '',
        },
      }),
      baseItem({
        callLogId: '2',
        aiStatus: 'completed',
        ai: {
          id: 'a2',
          callLogId: '2',
          callSid: 'CA2',
          agentExternalRef: 'agent-1',
          source: 'ai',
          configVersion: 'v1',
          indicators: [
            {
              key: 'a',
              label: 'Apertura',
              passed: false,
              maxPoints: 10,
              pointsEarned: 0,
            },
          ],
          totalScore: 45,
          maxScore: 100,
          interestScore: 2,
          status: 'completed',
          createdAt: '',
          updatedAt: '',
        },
      }),
      baseItem({ callLogId: '3', aiStatus: 'none' }),
    ];
    const actual = buildCallAuditAiReviewSummary(items);
    expect(actual.totalEligible).toBe(3);
    expect(actual.aiCompleted).toBe(2);
    expect(actual.aiNone).toBe(1);
    expect(actual.avgInterestScore).toBe(3);
    expect(actual.avgTotalScore).toBe(30);
    expect(actual.topFailedIndicators[0]).toEqual({ label: 'Apertura', count: 2 });
  });
});
