import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import { LeadAgentStageService } from './lead-agent-stage.service';
import type { LeadAgentStageInput } from './types/lead-agent-stage-input.type';

const buildInput = (overrides: Partial<LeadAgentStageInput> = {}): LeadAgentStageInput => ({
  profile: {},
  nextStep: LeadConversationStep.V2Conversation,
  status: 'active',
  intents: [],
  action: 'continue',
  hasNewHighIntent: false,
  hasProject: true,
  canOfferCall: true,
  ...overrides,
});

describe('LeadAgentStageService', () => {
  const service = new LeadAgentStageService();

  it('starts on opening and advances to discovery after the first turn when a project is set', () => {
    const actualProfile = service.applyStage(buildInput());
    expect(actualProfile).toMatchObject({ stage: 'discovery', stageTurns: 0 });
  });

  it('stays in opening while the lead has no project', () => {
    const actualProfile = service.applyStage(buildInput({ hasProject: false, intents: ['wants_call'] }));
    expect(actualProfile).toMatchObject({ stage: 'opening', stageTurns: 1 });
  });

  it('does not jump to booking without a project even when offering slots', () => {
    const actualProfile = service.applyStage(
      buildInput({ hasProject: false, profile: { stage: 'opening' }, action: 'offer_call_slots' }),
    );
    expect(actualProfile.stage).toBe('opening');
  });

  it('moves discovery to value when motivation and payment are known', () => {
    const inputProfile = { stage: 'discovery', stageTurns: 0, motivation: 'invest', paymentMethod: 'cash' } as const;
    const actualProfile = service.applyStage(buildInput({ profile: inputProfile }));
    expect(actualProfile).toMatchObject({ stage: 'value', stageTurns: 0 });
  });

  it('moves discovery to value when motivation and timeline are known', () => {
    const inputProfile = { stage: 'discovery', stageTurns: 0, motivation: 'build', timeline: 'later' } as const;
    expect(service.applyStage(buildInput({ profile: inputProfile })).stage).toBe('value');
  });

  it('stays in discovery with only the motivation and counts the turn', () => {
    const inputProfile = { stage: 'discovery', stageTurns: 1, motivation: 'build' } as const;
    const actualProfile = service.applyStage(buildInput({ profile: inputProfile }));
    expect(actualProfile).toMatchObject({ stage: 'discovery', stageTurns: 2 });
  });

  it('moves discovery to value on the fourth turn even without data', () => {
    const inputProfile = { stage: 'discovery', stageTurns: 3 } as const;
    expect(service.applyStage(buildInput({ profile: inputProfile })).stage).toBe('value');
  });

  it('keeps the profile facts when applying the stage', () => {
    const inputProfile = { stage: 'discovery', stageTurns: 0, budget: '80M', sentMedia: ['video'] } as const;
    const actualProfile = service.applyStage(buildInput({ profile: inputProfile }));
    expect(actualProfile).toMatchObject({ budget: '80M', sentMedia: ['video'] });
  });

  it('stays in value on the first turn and moves to bridge on the second', () => {
    const first = service.applyStage(buildInput({ profile: { stage: 'value', stageTurns: 0 } }));
    expect(first).toMatchObject({ stage: 'value', stageTurns: 1 });
    const second = service.applyStage(buildInput({ profile: first }));
    expect(second).toMatchObject({ stage: 'bridge', stageTurns: 0 });
  });

  it('moves value to bridge right away when a high intent question was just added', () => {
    const actualProfile = service.applyStage(
      buildInput({ profile: { stage: 'value', stageTurns: 0 }, hasNewHighIntent: true }),
    );
    expect(actualProfile.stage).toBe('bridge');
  });

  it('keeps bridge until the call is accepted', () => {
    const actualProfile = service.applyStage(buildInput({ profile: { stage: 'bridge', stageTurns: 5 } }));
    expect(actualProfile).toMatchObject({ stage: 'bridge', stageTurns: 6 });
  });

  it.each([LeadConversationStep.AskSchedule, LeadConversationStep.AskCallSlot])('is booking on step %s', (inputStep) => {
    const actualProfile = service.applyStage(buildInput({ profile: { stage: 'value' }, nextStep: inputStep }));
    expect(actualProfile).toMatchObject({ stage: 'booking', stageTurns: 0 });
  });

  it('jumps to booking when the customer wants a call and canOfferCall is true', () => {
    const actualProfile = service.applyStage(buildInput({ profile: { stage: 'opening' }, intents: ['wants_call'] }));
    expect(actualProfile.stage).toBe('booking');
  });

  it('does not jump to booking on wants_call when canOfferCall is false', () => {
    const actualProfile = service.applyStage(
      buildInput({ profile: { stage: 'discovery', stageTurns: 0 }, intents: ['wants_call'], canOfferCall: false }),
    );
    expect(actualProfile.stage).toBe('discovery');
  });

  it('does not jump to booking on offer_call_slots when canOfferCall is false', () => {
    const actualProfile = service.applyStage(
      buildInput({ profile: { stage: 'opening' }, action: 'offer_call_slots', canOfferCall: false }),
    );
    expect(actualProfile.stage).toBe('discovery');
  });

  it('jumps to booking when the agent offers call slots', () => {
    const actualProfile = service.applyStage(buildInput({ profile: { stage: 'discovery' }, action: 'offer_call_slots' }));
    expect(actualProfile.stage).toBe('booking');
  });

  it('stays in booking and counts turns while the customer has not booked', () => {
    const actualProfile = service.applyStage(buildInput({ profile: { stage: 'booking', stageTurns: 1 } }));
    expect(actualProfile).toMatchObject({ stage: 'booking', stageTurns: 2 });
  });

  it('is booked when the status is scheduled', () => {
    const actualProfile = service.applyStage(
      buildInput({ profile: { stage: 'booking' }, status: 'scheduled', nextStep: LeadConversationStep.Scheduled }),
    );
    expect(actualProfile).toMatchObject({ stage: 'booked', stageTurns: 0 });
  });

  it('stays booked afterwards', () => {
    const actualProfile = service.applyStage(
      buildInput({ profile: { stage: 'booked', stageTurns: 0 }, intents: ['wants_call'] }),
    );
    expect(actualProfile).toMatchObject({ stage: 'booked', stageTurns: 1 });
  });
});
