import { LeadAgentScoringService } from './lead-agent-scoring.service';
import type { LeadAgentIntent } from './types/lead-agent-intent.type';

describe('LeadAgentScoringService', () => {
  const service = new LeadAgentScoringService();

  describe('deriveSignals', () => {
    it('earns motivation_known for a motivation other than exploring', () => {
      const actualSignals = service.deriveSignals({ motivation: 'invest' }, [], []);
      expect(actualSignals).toEqual(['motivation_known']);
    });

    it('does not earn motivation_known when the lead is only exploring', () => {
      const actualSignals = service.deriveSignals({ motivation: 'exploring' }, [], []);
      expect(actualSignals).toEqual([]);
    });

    it('earns payment_known from the payment method', () => {
      const actualSignals = service.deriveSignals({ paymentMethod: 'cash' }, [], []);
      expect(actualSignals).toEqual(['payment_known']);
    });

    it('earns timeline_soon for within_3_months and timeline_later for later', () => {
      expect(service.deriveSignals({ timeline: 'within_3_months' }, [], [])).toEqual(['timeline_soon']);
      expect(service.deriveSignals({ timeline: 'later' }, [], [])).toEqual(['timeline_later']);
    });

    it('earns budget_known from budget or lotPreference', () => {
      expect(service.deriveSignals({ budget: '80 millones' }, [], [])).toEqual(['budget_known']);
      expect(service.deriveSignals({ lotPreference: '300 m2' }, [], [])).toEqual(['budget_known']);
      expect(service.deriveSignals({ budget: '   ' }, [], [])).toEqual([]);
    });

    it.each<LeadAgentIntent>(['asked_financing', 'asked_availability', 'asked_separation', 'asked_visit'])(
      'earns high_intent_question from the %s intent',
      (inputIntent) => {
        const actualSignals = service.deriveSignals({}, [inputIntent], []);
        expect(actualSignals).toEqual(['high_intent_question']);
      },
    );

    it.each<LeadAgentIntent>(['asked_price', 'asked_location', 'asked_legal', 'wants_call', 'not_interested'])(
      'does not earn high_intent_question from the %s intent',
      (inputIntent) => {
        const actualSignals = service.deriveSignals({}, [inputIntent], []);
        expect(actualSignals).toEqual([]);
      },
    );

    it('merges the existing signals without duplicates and drops unknown ones', () => {
      const actualSignals = service.deriveSignals({ paymentMethod: 'cash' }, [], ['payment_known', 'accepted_call', 'bogus']);
      expect(actualSignals).toEqual(['payment_known', 'accepted_call']);
    });
  });

  describe('computeScore', () => {
    it.each([
      ['motivation_known', 10],
      ['payment_known', 10],
      ['timeline_soon', 20],
      ['timeline_later', 5],
      ['budget_known', 10],
      ['high_intent_question', 20],
      ['accepted_call', 10],
      ['call_booked', 20],
    ])('gives %s %i points', (inputSignal, expectedScore) => {
      expect(service.computeScore([inputSignal])).toBe(expectedScore);
    });

    it('ignores timeline_later when timeline_soon is present', () => {
      expect(service.computeScore(['timeline_later', 'timeline_soon'])).toBe(20);
    });

    it('counts a repeated signal once', () => {
      expect(service.computeScore(['payment_known', 'payment_known'])).toBe(10);
    });

    it('caps the score at 100', () => {
      const inputSignals = [
        'motivation_known',
        'payment_known',
        'timeline_soon',
        'budget_known',
        'high_intent_question',
        'accepted_call',
        'call_booked',
        'timeline_later',
      ];
      expect(service.computeScore(inputSignals)).toBe(100);
    });
  });

  describe('deriveTemperature', () => {
    it.each([
      [0, 'cold'],
      [29, 'cold'],
      [30, 'warm'],
      [59, 'warm'],
      [60, 'hot'],
      [100, 'hot'],
    ] as const)('maps score %i to %s', (inputScore, expectedTemperature) => {
      expect(service.deriveTemperature(inputScore)).toBe(expectedTemperature);
    });
  });

  describe('derivePriority', () => {
    it('maps hot to 3, warm to 2 and cold to 1', () => {
      expect(service.derivePriority('hot')).toBe(3);
      expect(service.derivePriority('warm')).toBe(2);
      expect(service.derivePriority('cold')).toBe(1);
    });
  });

  describe('buildScoreSegments', () => {
    it('returns the seven Spanish segments with Plazo merged', () => {
      const actualSegments = service.buildScoreSegments([]);
      expect(actualSegments.map((segment) => segment.label)).toEqual([
        'Motivación',
        'Forma de pago',
        'Plazo',
        'Presupuesto',
        'Pregunta de alta intención',
        'Aceptó llamada',
        'Llamada agendada',
      ]);
      expect(actualSegments.map((segment) => segment.points)).toEqual([10, 10, 20, 10, 20, 10, 20]);
      expect(actualSegments.every((segment) => !segment.isEarned)).toBe(true);
    });

    it('marks earned segments and merges both timeline signals into Plazo', () => {
      const actualSegments = service.buildScoreSegments(['timeline_later', 'call_booked']);
      const actualEarned = actualSegments.filter((segment) => segment.isEarned).map((segment) => segment.label);
      expect(actualEarned).toEqual(['Plazo', 'Llamada agendada']);
      expect(actualSegments.find((segment) => segment.key === 'timeline')?.earnedPoints).toBe(5);
    });
  });
});
