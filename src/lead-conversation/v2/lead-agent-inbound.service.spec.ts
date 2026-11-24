import { Types } from 'mongoose';
import type { LeadSessionSnapshot } from '../lead-conversation-session.service';
import type { InboundLeadMessage } from '../types/inbound-lead-message.type';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import { LeadAgentInboundService } from './lead-agent-inbound.service';

const mockSessionId = new Types.ObjectId();
const mockStoredId = new Types.ObjectId();
const mockMessage: InboundLeadMessage = {
  wamid: 'wamid.7',
  waId: '573001112233',
  phoneNumberId: '111',
  profileName: 'Camila',
  type: 'text',
  text: 'Hola',
  timestamp: new Date('2026-11-20T15:00:00.000Z'),
};

const buildSession = (overrides: Partial<LeadSessionSnapshot> = {}): LeadSessionSnapshot =>
  ({
    _id: mockSessionId,
    customerId: new Types.ObjectId(),
    waId: '573001112233',
    step: LeadConversationStep.V2Conversation,
    status: 'active',
    flowVersion: 'v2',
    recovery: { anchorAt: new Date(), sentStepIds: [] },
    version: 2,
    ...overrides,
  }) as unknown as LeadSessionSnapshot;

const buildService = (settings: Record<string, unknown> = {}) => {
  const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const mockSettings = {
    executeGetOrCreate: jest.fn().mockResolvedValue({ enabled: true, replyDebounceSeconds: 8, ...settings }),
  };
  const mockRecoveryScheduler = { executeCancel: jest.fn().mockResolvedValue(undefined) };
  const mockRecoverySequence = { executeIncrementReplied: jest.fn().mockResolvedValue(undefined) };
  const mockSender = { executeMarkRead: jest.fn().mockResolvedValue(undefined) };
  const mockSlotBridge = { executeTryHandle: jest.fn().mockResolvedValue(null) };
  const mockSessionService = {
    applyTransition: jest.fn(),
    findById: jest.fn(),
    reenterDiscoveryAfterRecovery: jest.fn().mockResolvedValue(undefined),
  };
  const mockMessageLog = { findLatestInbound: jest.fn().mockResolvedValue({ _id: mockStoredId, wamid: mockMessage.wamid }) };
  const mockSideEffects = { executeRun: jest.fn().mockResolvedValue(undefined) };
  const service = new LeadAgentInboundService(
    mockQueue as never,
    mockSettings as never,
    mockRecoveryScheduler as never,
    mockRecoverySequence as never,
    mockSender as never,
    mockSlotBridge as never,
    mockSessionService as never,
    mockMessageLog as never,
    mockSideEffects as never,
  );
  return {
    service,
    mockQueue,
    mockRecoveryScheduler,
    mockRecoverySequence,
    mockSender,
    mockSlotBridge,
    mockSessionService,
    mockSideEffects,
  };
};

describe('LeadAgentInboundService', () => {
  it('Given a V2 message, When handled, Then recovery is cancelled, the message is marked read and a debounced turn is queued', async () => {
    const { service, mockQueue, mockRecoveryScheduler, mockSender } = buildService();
    await service.executeHandle(buildSession(), mockMessage);
    expect(mockRecoveryScheduler.executeCancel).toHaveBeenCalledWith(String(mockSessionId));
    expect(mockSender.executeMarkRead).toHaveBeenCalledWith('wamid.7');
    expect(mockQueue.add).toHaveBeenCalledWith(
      'agent-turn',
      { sessionId: String(mockSessionId), wamid: 'wamid.7' },
      expect.objectContaining({ jobId: `turn-${String(mockSessionId)}-wamid.7`, delay: 8000 }),
    );
  });

  it('Given recovery steps were sent, When the customer replies, Then the reply is counted on the last step', async () => {
    const { service, mockRecoverySequence } = buildService();
    await service.executeHandle(buildSession({ recovery: { sentStepIds: ['a', 'b'] } }), mockMessage);
    expect(mockRecoverySequence.executeIncrementReplied).toHaveBeenCalledWith('b');
  });

  it.each([
    ['the assistant is disabled', {}, { enabled: false }],
    ['the lead opted out', { optedOutAt: new Date() }, {}],
    ['the lead is disqualified', { status: 'disqualified' }, {}],
  ])('Given %s, When handled, Then no reply is queued', async (_label, sessionOverrides, settings) => {
    const { service, mockQueue, mockSender } = buildService(settings);
    await service.executeHandle(buildSession(sessionOverrides as Partial<LeadSessionSnapshot>), mockMessage);
    expect(mockQueue.add).not.toHaveBeenCalled();
    expect(mockSender.executeMarkRead).not.toHaveBeenCalled();
  });

  it('Given a slot choice while waiting for a slot, When handled, Then the transition is applied with side effects and no turn is queued', async () => {
    const { service, mockQueue, mockSlotBridge, mockSessionService, mockSideEffects } = buildService();
    const mockTransition = { nextStep: LeadConversationStep.Scheduled, outbound: [], expectsReply: false, status: 'scheduled' };
    const mockUpdated = buildSession({ step: LeadConversationStep.Scheduled });
    mockSlotBridge.executeTryHandle.mockResolvedValue(mockTransition);
    mockSessionService.applyTransition.mockResolvedValue(mockUpdated);
    await service.executeHandle(buildSession({ step: LeadConversationStep.AskCallSlot }), mockMessage);
    expect(mockSlotBridge.executeTryHandle).toHaveBeenCalledWith(expect.anything(), mockMessage, String(mockStoredId));
    expect(mockSideEffects.executeRun).toHaveBeenCalledWith({ session: mockUpdated, transition: mockTransition });
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('Given free text while waiting for a slot, When the bridge returns null, Then the agent turn is queued', async () => {
    const { service, mockQueue, mockSessionService } = buildService();
    await service.executeHandle(buildSession({ step: LeadConversationStep.AskSchedule }), mockMessage);
    expect(mockSessionService.applyTransition).not.toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  it('Given a lock conflict on the slot transition, When handled, Then it retries with a fresh snapshot', async () => {
    const { service, mockSlotBridge, mockSessionService, mockSideEffects } = buildService();
    mockSlotBridge.executeTryHandle.mockResolvedValue({ nextStep: LeadConversationStep.AskCallSlot, outbound: [], expectsReply: true });
    mockSessionService.applyTransition.mockResolvedValueOnce(null).mockResolvedValueOnce(buildSession());
    mockSessionService.findById.mockResolvedValue(buildSession({ step: LeadConversationStep.AskCallSlot }));
    await service.executeHandle(buildSession({ step: LeadConversationStep.AskCallSlot }), mockMessage);
    expect(mockSessionService.applyTransition).toHaveBeenCalledTimes(2);
    expect(mockSideEffects.executeRun).toHaveBeenCalledTimes(1);
  });
});
