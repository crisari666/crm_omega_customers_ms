import type { Job } from 'bullmq';
import { Types } from 'mongoose';
import type { LeadRecoveryJobData } from '../../lead-assistant/types/lead-recovery-job-data.type';
import type { LeadRecoveryStep } from '../../lead-assistant/types/lead-recovery-step.type';
import type { LeadSessionSnapshot } from '../lead-conversation-session.service';
import { LeadAgentRecoveryProcessor } from './lead-agent-recovery.processor';

const mockSessionId = new Types.ObjectId();
const mockAnchorAt = new Date('2026-11-20T12:00:00.000Z');

const buildSession = (overrides: Partial<LeadSessionSnapshot> = {}): LeadSessionSnapshot =>
  ({
    _id: mockSessionId,
    customerId: new Types.ObjectId(),
    waId: '573001112233',
    firstName: 'Camila',
    projectTitle: 'Valle del Sol',
    status: 'active',
    flowVersion: 'v2',
    recovery: { anchorAt: mockAnchorAt, sentStepIds: [] },
    ...overrides,
  }) as unknown as LeadSessionSnapshot;

const buildStep = (overrides: Partial<LeadRecoveryStep> = {}): LeadRecoveryStep => ({
  id: 'step-1',
  label: 'Seguimiento 2h',
  offsetHours: 2,
  enabled: true,
  template: { name: 'seguimiento_2h', language: 'es', bodyText: 'Hola {{1}}', bindings: [] },
  sentCount: 0,
  repliedCount: 0,
  ...overrides,
});

const buildJob = (overrides: Partial<LeadRecoveryJobData> = {}): Job<LeadRecoveryJobData> =>
  ({
    data: { sessionId: String(mockSessionId), stepId: 'step-1', anchorAt: mockAnchorAt.toISOString(), ...overrides },
  }) as Job<LeadRecoveryJobData>;

const buildProcessor = (input: { session?: LeadSessionSnapshot | null; step?: LeadRecoveryStep | null; enabled?: boolean } = {}) => {
  const mockSessionService = {
    findById: jest.fn().mockResolvedValue(input.session === undefined ? buildSession() : input.session),
    markAbandoned: jest.fn().mockResolvedValue(undefined),
    addRecoverySentStep: jest.fn().mockResolvedValue(undefined),
  };
  const mockSettings = {
    executeGetOrCreate: jest.fn().mockResolvedValue({ enabled: input.enabled ?? true, assistantName: 'Sofía', businessName: 'GTower' }),
  };
  const mockSequence = {
    findStep: jest.fn().mockResolvedValue(input.step === undefined ? buildStep() : input.step),
    executeIncrementSent: jest.fn().mockResolvedValue(undefined),
  };
  const mockScheduler = { executeScheduleNext: jest.fn().mockResolvedValue(undefined) };
  const mockRenderer = {
    executeRender: jest.fn().mockReturnValue({ templateComponents: [{ type: 'body' }], renderedBody: 'Hola Camila' }),
  };
  const mockDispatcher = { executeDispatch: jest.fn().mockResolvedValue(undefined) };
  const processor = new LeadAgentRecoveryProcessor(
    mockSessionService as never,
    mockSettings as never,
    mockSequence as never,
    mockScheduler as never,
    mockRenderer as never,
    mockDispatcher as never,
  );
  return { processor, mockSessionService, mockSequence, mockScheduler, mockRenderer, mockDispatcher };
};

describe('LeadAgentRecoveryProcessor', () => {
  it.each([
    ['the session is missing', { session: null }],
    ['the flow is v1', { session: buildSession({ flowVersion: 'v1' }) }],
    ['the session is not active', { session: buildSession({ status: 'scheduled' }) }],
    ['the lead opted out', { session: buildSession({ optedOutAt: new Date() }) }],
    ['the assistant is disabled', { enabled: false }],
    [
      'the anchor changed (customer replied since)',
      { session: buildSession({ recovery: { anchorAt: new Date(mockAnchorAt.getTime() + 60_000), sentStepIds: [] } }) },
    ],
  ])('Given %s, When processed, Then nothing is sent or changed', async (_label, input) => {
    const { processor, mockDispatcher, mockSessionService, mockScheduler } = buildProcessor(input);
    await processor.process(buildJob());
    expect(mockDispatcher.executeDispatch).not.toHaveBeenCalled();
    expect(mockSessionService.markAbandoned).not.toHaveBeenCalled();
    expect(mockScheduler.executeScheduleNext).not.toHaveBeenCalled();
  });

  it('Given the closing job (stepId null), When processed, Then the session is abandoned and nothing is sent', async () => {
    const { processor, mockSessionService, mockDispatcher } = buildProcessor();
    await processor.process(buildJob({ stepId: null }));
    expect(mockSessionService.markAbandoned).toHaveBeenCalledWith(mockSessionId);
    expect(mockDispatcher.executeDispatch).not.toHaveBeenCalled();
  });

  it('Given a disabled step, When processed, Then it is skipped and the next step is scheduled', async () => {
    const { processor, mockDispatcher, mockScheduler, mockSequence } = buildProcessor({ step: buildStep({ enabled: false }) });
    await processor.process(buildJob());
    expect(mockDispatcher.executeDispatch).not.toHaveBeenCalled();
    expect(mockSequence.executeIncrementSent).not.toHaveBeenCalled();
    expect(mockScheduler.executeScheduleNext).toHaveBeenCalledWith({
      sessionId: String(mockSessionId),
      anchorAt: mockAnchorAt.toISOString(),
      sentStepIds: [],
    });
  });

  it('Given a missing step, When processed, Then the next step is scheduled', async () => {
    const { processor, mockDispatcher, mockScheduler } = buildProcessor({ step: null });
    await processor.process(buildJob());
    expect(mockDispatcher.executeDispatch).not.toHaveBeenCalled();
    expect(mockScheduler.executeScheduleNext).toHaveBeenCalledTimes(1);
  });

  it('Given an enabled step, When processed, Then one rendered template is dispatched and the step is recorded', async () => {
    const { processor, mockDispatcher, mockSessionService, mockSequence, mockScheduler, mockRenderer } = buildProcessor();
    await processor.process(buildJob());
    expect(mockRenderer.executeRender).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'seguimiento_2h' }),
      { firstName: 'Camila', assistantName: 'Sofía', businessName: 'GTower', projectTitle: 'Valle del Sol' },
    );
    expect(mockDispatcher.executeDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '573001112233',
        messages: [
          {
            kind: 'template',
            body: 'Hola Camila',
            templateName: 'seguimiento_2h',
            languageCode: 'es',
            templateComponents: [{ type: 'body' }],
          },
        ],
      }),
    );
    expect(mockSessionService.addRecoverySentStep).toHaveBeenCalledWith(mockSessionId, 'step-1');
    expect(mockSequence.executeIncrementSent).toHaveBeenCalledWith('step-1');
    expect(mockScheduler.executeScheduleNext).toHaveBeenCalledWith({
      sessionId: String(mockSessionId),
      anchorAt: mockAnchorAt.toISOString(),
      sentStepIds: ['step-1'],
    });
  });
});
