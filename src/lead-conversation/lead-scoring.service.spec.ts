import { LeadScoringService } from './lead-scoring.service';

describe('LeadScoringService', () => {
  const service = new LeadScoringService();
  const emptyState = { score: 0, priority: 1, scoreHistory: [] };

  it('adds +1 lot range, +2 payment, +3 schedule up to 6 with high priority', () => {
    const afterLot = service.applyScoreEvent(emptyState, 'lot_range');
    const afterPayment = service.applyScoreEvent(afterLot, 'payment');
    const actual = service.applyScoreEvent(afterPayment, 'schedule');
    expect(actual.score).toBe(6);
    expect(actual.priority).toBe(3);
  });

  it('does not count the same event twice', () => {
    const once = service.applyScoreEvent(emptyState, 'payment');
    const actual = service.applyScoreEvent(once, 'payment');
    expect(actual.score).toBe(2);
  });

  it('forces score 1 and priority 1 when the reminder is declined', () => {
    const scored = service.applyScoreEvent(service.applyScoreEvent(emptyState, 'lot_range'), 'payment');
    const actual = service.applyScoreEvent(scored, 'reminder_declined');
    expect(actual).toMatchObject({ score: 1, priority: 1 });
  });
});
