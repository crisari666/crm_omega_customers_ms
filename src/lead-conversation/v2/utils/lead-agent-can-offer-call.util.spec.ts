import { LeadConversationStep } from '../../types/lead-conversation-step.enum';
import { isLeadQualifiedToOfferCall } from './lead-agent-can-offer-call.util';

describe('isLeadQualifiedToOfferCall', () => {
  it('is true when already choosing a schedule or slot', () => {
    expect(
      isLeadQualifiedToOfferCall({
        step: LeadConversationStep.AskSchedule,
      }),
    ).toBe(true);
    expect(
      isLeadQualifiedToOfferCall({
        step: LeadConversationStep.AskCallSlot,
        projectId: undefined,
        motivation: undefined,
      }),
    ).toBe(true);
  });

  it('is false without a project', () => {
    expect(
      isLeadQualifiedToOfferCall({
        step: LeadConversationStep.V2Conversation,
        motivation: 'build',
      }),
    ).toBe(false);
  });

  it.each(['build', 'invest', 'leisure'] as const)('is true with project and buyer motivation %s', (motivation) => {
    expect(
      isLeadQualifiedToOfferCall({
        step: LeadConversationStep.V2Conversation,
        projectId: 'p1',
        motivation,
      }),
    ).toBe(true);
  });

  it('is false when motivation is exploring or missing', () => {
    expect(
      isLeadQualifiedToOfferCall({
        step: LeadConversationStep.V2Conversation,
        projectId: 'p1',
        motivation: 'exploring',
      }),
    ).toBe(false);
    expect(
      isLeadQualifiedToOfferCall({
        step: LeadConversationStep.V2Conversation,
        projectId: 'p1',
      }),
    ).toBe(false);
  });
});
