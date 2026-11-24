import type { Job } from 'bullmq';
import { Types } from 'mongoose';
import { LEAD_AGENT_HISTORY_LIMIT } from '../constants/lead-conversation.constants';
import type { LeadSessionSnapshot } from '../lead-conversation-session.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { StepTransition } from '../types/step-transition.type';
import { LeadAgentTurnProcessor } from './lead-agent-turn.processor';
import type { LeadAgentTurnJobData } from './types/lead-agent-turn-job-data.type';

const mockSessionId = new Types.ObjectId();
const mockLatestId = new Types.ObjectId();
const mockPreviousId = new Types.ObjectId();
const mockInboundAt = new Date('2026-11-20T15:00:00.000Z');

const buildSession = (overrides: Partial<LeadSessionSnapshot> = {}): LeadSessionSnapshot =>
  ({
    _id: mockSessionId,
    customerId: new Types.ObjectId(),
    waId: '573001112233',
    firstName: 'Camila',
    step: LeadConversationStep.V2Conversation,
    status: 'active',
    flowVersion: 'v2',
    leadProfile: {},
    scoreSignals: [],
    answers: {},
    pendingOptions: [],
    version: 4,
    ...overrides,
  }) as unknown as LeadSessionSnapshot;

const mockLatest = { _id: mockLatestId, wamid: 'wamid.2', direction: 'inbound', body: '¿Cuánto cuesta?', timestamp: mockInboundAt };
const mockTransition: StepTransition = {
  nextStep: LeadConversationStep.V2Conversation,
  sessionPatch: { score: 10 },
  outbound: [{ kind: 'text', body: 'Desde 51 millones.' }],
  expectsReply: true,
};
const buildJob = (wamid = 'wamid.2'): Job<LeadAgentTurnJobData> =>
  ({ data: { sessionId: String(mockSessionId), wamid } }) as Job<LeadAgentTurnJobData>;

const buildProcessor = (session: LeadSessionSnapshot | null = buildSession()) => {
  const mockSessionService = {
    findById: jest.fn().mockResolvedValue(session),
    applyTransition: jest.fn().mockImplementation(async (current: LeadSessionSnapshot) => ({ ...current, version: current.version + 1 })),
  };
  const mockMessageLog = {
    findLatestInbound: jest.fn().mockResolvedValue(mockLatest),
    findInboundAfter: jest.fn().mockResolvedValue([mockLatest]),
    findRecent: jest.fn().mockResolvedValue([
      { _id: mockPreviousId, direction: 'outbound', body: 'Hola Camila' },
      mockLatest,
    ]),
  };
  const mockEngine = {
    executeTurn: jest.fn().mockResolvedValue({ transition: mockTransition, usedFaqIds: ['faq-1'], unansweredQuestion: 'q?' }),
  };
  const mockSideEffects = { executeRun: jest.fn().mockResolvedValue(undefined) };
  const processor = new LeadAgentTurnProcessor(
    mockSessionService as never,
    mockMessageLog as never,
    mockEngine as never,
    mockSideEffects as never,
  );
  return { processor, mockSessionService, mockMessageLog, mockEngine, mockSideEffects };
};

describe('LeadAgentTurnProcessor', () => {
  it('Given a missing session, When processed, Then nothing happens', async () => {
    const { processor, mockEngine } = buildProcessor(null);
    await processor.process(buildJob());
    expect(mockEngine.executeTurn).not.toHaveBeenCalled();
  });

  it('Given a v1 session, When processed, Then nothing happens', async () => {
    const { processor, mockEngine } = buildProcessor(buildSession({ flowVersion: 'v1' }));
    await processor.process(buildJob());
    expect(mockEngine.executeTurn).not.toHaveBeenCalled();
  });

  it('Given an older job whose wamid is no longer the latest inbound, When processed, Then it is skipped', async () => {
    const { processor, mockEngine, mockSessionService } = buildProcessor();
    await processor.process(buildJob('wamid.1'));
    expect(mockEngine.executeTurn).not.toHaveBeenCalled();
    expect(mockSessionService.applyTransition).not.toHaveBeenCalled();
  });

  it('Given no inbound after lastTurnMessageId, When processed, Then nothing is answered', async () => {
    const { processor, mockMessageLog, mockEngine } = buildProcessor(buildSession({ lastTurnMessageId: String(mockLatestId) }));
    mockMessageLog.findInboundAfter.mockResolvedValue([]);
    await processor.process(buildJob());
    expect(mockMessageLog.findInboundAfter).toHaveBeenCalledWith(mockSessionId, mockLatestId);
    expect(mockEngine.executeTurn).not.toHaveBeenCalled();
  });

  it('Given pending messages, When processed, Then the engine answers, the turn is stamped and side effects run', async () => {
    const { processor, mockSessionService, mockMessageLog, mockEngine, mockSideEffects } = buildProcessor();
    await processor.process(buildJob());
    expect(mockMessageLog.findRecent).toHaveBeenCalledWith(mockSessionId, LEAD_AGENT_HISTORY_LIMIT);
    expect(mockEngine.executeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        history: [{ direction: 'outbound', body: 'Hola Camila' }],
        pendingMessages: [{ text: '¿Cuánto cuesta?' }],
      }),
    );
    const [, appliedTransition, appliedInboundAt] = mockSessionService.applyTransition.mock.calls[0];
    expect(appliedTransition.sessionPatch).toEqual({
      score: 10,
      lastTurnMessageId: String(mockLatestId),
      recovery: { anchorAt: mockInboundAt, sentStepIds: [] },
    });
    expect(appliedInboundAt).toBe(mockInboundAt);
    expect(mockSideEffects.executeRun).toHaveBeenCalledWith(
      expect.objectContaining({ usedFaqIds: ['faq-1'], unansweredQuestion: 'q?' }),
    );
  });

  it('Given a lock conflict, When processed, Then it reloads the session and retries up to success', async () => {
    const { processor, mockSessionService, mockEngine, mockSideEffects } = buildProcessor();
    mockSessionService.applyTransition
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async (current: LeadSessionSnapshot) => ({ ...current, version: current.version + 1 }));
    await processor.process(buildJob());
    expect(mockSessionService.findById).toHaveBeenCalledTimes(2);
    expect(mockEngine.executeTurn).toHaveBeenCalledTimes(2);
    expect(mockSessionService.applyTransition).toHaveBeenCalledTimes(2);
    expect(mockSideEffects.executeRun).toHaveBeenCalledTimes(1);
  });

  it('Given three lock conflicts, When processed, Then it gives up without side effects', async () => {
    const { processor, mockSessionService, mockSideEffects } = buildProcessor();
    mockSessionService.applyTransition.mockResolvedValue(null);
    await processor.process(buildJob());
    expect(mockSessionService.applyTransition).toHaveBeenCalledTimes(3);
    expect(mockSideEffects.executeRun).not.toHaveBeenCalled();
  });
});
