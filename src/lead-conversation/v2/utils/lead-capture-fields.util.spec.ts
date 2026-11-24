import {
  buildCaptureKnown,
  inferUrgencyFromTimeToBuy,
  resolveNextCaptureField,
} from './lead-capture-fields.util';

describe('lead-capture-fields.util', () => {
  it('infers urgency from timeToBuy', () => {
    expect(inferUrgencyFromTimeToBuy('immediate')).toBe('high');
    expect(inferUrgencyFromTimeToBuy('within_30_days')).toBe('high');
    expect(inferUrgencyFromTimeToBuy('within_3_months')).toBe('medium');
    expect(inferUrgencyFromTimeToBuy('future')).toBe('low');
    expect(inferUrgencyFromTimeToBuy('not_now')).toBe('low');
  });

  it('resolves paymentMethod before booking and late capture after booking', () => {
    expect(resolveNextCaptureField({ projectId: 'p1' })).toBe('paymentMethod');
    expect(resolveNextCaptureField({ projectId: 'p1', buyMotive: 'live' })).toBe('paymentMethod');
    expect(
      resolveNextCaptureField({
        projectId: 'p1',
        buyMotive: 'live',
        paymentMethod: 'cash',
      }),
    ).toBeUndefined();
    expect(
      resolveNextCaptureField(
        {
          projectId: 'p1',
          buyMotive: 'live',
          paymentMethod: 'cash',
        },
        true,
      ),
    ).toBe('timeToBuy');
    expect(
      resolveNextCaptureField(
        {
          projectId: 'p1',
          buyMotive: 'live',
          paymentMethod: 'cash',
          timeToBuy: 'immediate',
          urgencyLevel: 'high',
          decisionMaker: 'self',
        },
        true,
      ),
    ).toBeUndefined();
  });

  it('builds capture known from metadata and profile', () => {
    const known = buildCaptureKnown({
      metadataValues: { city: 'Bogotá' },
      profile: { motivation: 'invest', timeline: 'within_30_days' },
      projectId: 'p1',
    });
    expect(known).toMatchObject({
      projectId: 'p1',
      city: 'Bogotá',
      buyMotive: 'invest',
      timeToBuy: 'within_30_days',
      urgencyLevel: 'high',
    });
  });
});
