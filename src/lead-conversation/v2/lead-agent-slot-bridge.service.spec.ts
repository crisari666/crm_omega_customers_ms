import { Types } from 'mongoose';
import type { LeadSessionSnapshot } from '../lead-conversation-session.service';
import type { InboundLeadMessage } from '../types/inbound-lead-message.type';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { StepTransition } from '../types/step-transition.type';
import { LeadAgentScoringService } from './lead-agent-scoring.service';
import { LeadAgentSlotBridgeService } from './lead-agent-slot-bridge.service';

const mockMessage: InboundLeadMessage = {
  wamid: 'wamid.1',
  waId: '573001112233',
  hasSendablePhone: true,
  phoneNumberId: '111',
  profileName: 'Camila',
  type: 'interactive',
  text: '4:00 pm',
  replyId: 'slot:2026-10-16T21:00:00.000Z',
  timestamp: new Date(),
};

const buildSession = (overrides: Partial<LeadSessionSnapshot> = {}): LeadSessionSnapshot =>
  ({
    _id: new Types.ObjectId(),
    customerId: new Types.ObjectId(),
    step: LeadConversationStep.AskCallSlot,
    status: 'active',
    flowVersion: 'v2',
    scoreSignals: [],
    leadProfile: { stage: 'bridge', stageTurns: 1 },
    ...overrides,
  }) as unknown as LeadSessionSnapshot;

const buildBridge = (transition: StepTransition) => {
  const mockStateMachine = { executeTransition: jest.fn().mockResolvedValue(transition) };
  const bridge = new LeadAgentSlotBridgeService(mockStateMachine as never, new LeadAgentScoringService());
  return { bridge, mockStateMachine };
};

describe('LeadAgentSlotBridgeService', () => {
  it('Given the customer picked a period, When handled, Then accepted_call is added and the V1 score event is removed', async () => {
    const inputTransition: StepTransition = {
      nextStep: LeadConversationStep.AskCallSlot,
      outbound: [{ kind: 'list', body: 'Elige un horario' }],
      expectsReply: true,
      scoreEvent: 'payment',
    };
    const { bridge } = buildBridge(inputTransition);
    const actual = await bridge.executeTryHandle(buildSession({ step: LeadConversationStep.AskSchedule }), mockMessage);
    expect(actual).not.toBeNull();
    expect(actual).not.toHaveProperty('scoreEvent');
    expect(actual?.sessionPatch).toMatchObject({
      scoreSignals: ['accepted_call'],
      score: 10,
      priority: 1,
      temperature: 'cold',
      leadProfile: { stage: 'booking', stageTurns: 0 },
    });
  });

  it('Given the customer booked a slot, When handled, Then call_booked is added, stage is booked and the score is not clamped to V1', async () => {
    const inputTransition: StepTransition = {
      nextStep: LeadConversationStep.Scheduled,
      status: 'scheduled',
      answersPatch: { fechaLlamada: '2026-10-16T21:00:00.000Z' },
      scoreEvent: 'schedule',
      outbound: [{ kind: 'text', body: 'Listo, llamada agendada' }],
      expectsReply: false,
      shouldQualify: true,
    };
    const { bridge } = buildBridge(inputTransition);
    const inputSession = buildSession({ scoreSignals: ['motivation_known', 'payment_known', 'timeline_soon', 'accepted_call'] });
    const actual = await bridge.executeTryHandle(inputSession, mockMessage, 'message-id-1');
    expect(actual).toMatchObject({ status: 'scheduled', shouldQualify: true, nextStep: LeadConversationStep.Scheduled });
    expect(actual).not.toHaveProperty('scoreEvent');
    expect(actual?.sessionPatch).toMatchObject({
      score: 70,
      priority: 3,
      temperature: 'hot',
      lastTurnMessageId: 'message-id-1',
      leadProfile: { stage: 'booked', stageTurns: 0 },
    });
    expect(actual?.sessionPatch?.scoreSignals).toEqual(
      expect.arrayContaining(['motivation_known', 'payment_known', 'timeline_soon', 'accepted_call', 'call_booked']),
    );
  });

  it('Given free text that is not a slot choice, When the V1 handler asks again, Then null is returned so the agent answers', async () => {
    const { bridge } = buildBridge({
      nextStep: LeadConversationStep.AskCallSlot,
      outbound: [{ kind: 'text', body: 'Elige una opción' }],
      expectsReply: true,
      isRetry: true,
    });
    const actual = await bridge.executeTryHandle(buildSession(), { ...mockMessage, replyId: undefined, text: 'cuánto cuesta?' });
    expect(actual).toBeNull();
  });

  it('Given a silent V1 transition, When handled, Then null is returned', async () => {
    const { bridge } = buildBridge({ nextStep: LeadConversationStep.AskCallSlot, outbound: [], expectsReply: false });
    const actual = await bridge.executeTryHandle(buildSession(), mockMessage);
    expect(actual).toBeNull();
  });
});
