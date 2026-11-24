import { adoptLeadCaptureFromReplyId } from './adopt-lead-capture-reply.util';

describe('adoptLeadCaptureFromReplyId', () => {
  it('maps time reply ids to timeline and urgency metadata', () => {
    expect(adoptLeadCaptureFromReplyId('time:immediate')).toEqual({
      field: 'timeToBuy',
      profilePatch: { timeline: 'immediate' },
      metadataPatch: { timeToBuy: 'immediate', urgencyLevel: 'high' },
    });
  });

  it('maps payment reply ids to profile and capture codes', () => {
    expect(adoptLeadCaptureFromReplyId('pay:cash')).toEqual({
      field: 'paymentMethod',
      profilePatch: { paymentMethod: 'cash' },
      metadataPatch: { paymentMethod: 'cash' },
    });
    expect(adoptLeadCaptureFromReplyId('pay:financed')).toEqual({
      field: 'paymentMethod',
      profilePatch: { paymentMethod: 'financed' },
      metadataPatch: { paymentMethod: 'financing' },
    });
  });

  it('maps decision and urgency reply ids', () => {
    expect(adoptLeadCaptureFromReplyId('decision:family')?.metadataPatch).toEqual({
      decisionMaker: 'family',
    });
    expect(adoptLeadCaptureFromReplyId('urgency:medium')?.metadataPatch).toEqual({
      urgencyLevel: 'medium',
    });
  });
});
