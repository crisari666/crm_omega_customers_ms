import { Types } from 'mongoose';
import { LeadConversationStep } from '../lead-conversation/types/lead-conversation-step.enum';
import { LeadAgentSessionAdoptionService } from './lead-agent-session-adoption.service';

const execResult = <T>(value: T): { exec: jest.Mock } => ({ exec: jest.fn().mockResolvedValue(value) });
const mockSessionId = new Types.ObjectId();
const mockLastInboundId = new Types.ObjectId();

const buildSession = (overrides: Record<string, unknown> = {}) => ({
  _id: mockSessionId,
  flowVersion: 'v1',
  status: 'active',
  step: LeadConversationStep.Initial,
  score: 0,
  ...overrides,
});

const buildService = (session: Record<string, unknown> | null) => {
  const mockSessionModel = {
    findOne: jest.fn().mockReturnValue({ sort: () => ({ select: () => ({ lean: () => execResult(session) }) }) }),
    updateOne: jest.fn().mockReturnValue(execResult({})),
  };
  const mockMessageModel = {
    findOne: jest.fn().mockReturnValue({
      sort: () => ({ select: () => ({ lean: () => execResult({ _id: mockLastInboundId }) }) }),
    }),
  };
  const service = new LeadAgentSessionAdoptionService(mockSessionModel as never, mockMessageModel as never);
  return { service, mockSessionModel };
};

describe('LeadAgentSessionAdoptionService', () => {
  it.each([
    ['there is no session', null],
    ['the session is already v2', buildSession({ flowVersion: 'v2' })],
    ['the session is scheduled', buildSession({ status: 'scheduled', step: LeadConversationStep.Scheduled, score: 6 })],
    ['the active session already progressed', buildSession({ step: LeadConversationStep.AskPayment })],
    ['the active session already has score', buildSession({ step: LeadConversationStep.AskProject, score: 1 })],
  ])('Given %s, When adopting, Then nothing changes', async (_label, session) => {
    const { service, mockSessionModel } = buildService(session);
    await service.executeAdopt({ phone: '+57 300 111 2233', formId: 'form-1' });
    expect(mockSessionModel.updateOne).not.toHaveBeenCalled();
  });

  it('Given no digits in the phone, When adopting, Then no lookup happens', async () => {
    const { service, mockSessionModel } = buildService(buildSession());
    await service.executeAdopt({ phone: 'n/a' });
    expect(mockSessionModel.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ['initial', LeadConversationStep.Initial],
    ['ask_project', LeadConversationStep.AskProject],
  ])('Given an active %s session with score 0, When adopting, Then it is converted to v2', async (_label, step) => {
    const { service, mockSessionModel } = buildService(buildSession({ step }));
    await service.executeAdopt({ phone: '573001112233', formId: 'form-1' });
    expect(mockSessionModel.findOne).toHaveBeenCalledWith({ waId: '573001112233' });
    const [filter, update] = mockSessionModel.updateOne.mock.calls[0];
    expect(filter).toMatchObject({ _id: mockSessionId });
    expect(update.$set).toMatchObject({
      flowVersion: 'v2',
      formId: 'form-1',
      step: LeadConversationStep.V2Conversation,
      pendingOptions: [],
      lastQuestion: [],
      leadProfile: { stage: 'opening', stageTurns: 0 },
      lastTurnMessageId: String(mockLastInboundId),
    });
    expect(update.$unset).toHaveProperty('lastQuestionAt');
    expect(update.$unset).toHaveProperty('projectId');
    expect(update.$unset).toHaveProperty('projectTitle');
    expect(update.$inc).toEqual({ version: 1 });
  });

  it.each(['disqualified', 'abandoned'])(
    'Given a %s session, When adopting, Then it is converted and fully reset to active',
    async (status) => {
      const { service, mockSessionModel } = buildService(
        buildSession({ status, step: LeadConversationStep.AskPayment, score: 3 }),
      );
      await service.executeAdopt({ phone: '573001112233', formId: 'form-1' });
      const [, update] = mockSessionModel.updateOne.mock.calls[0];
      expect(update.$set).toMatchObject({
        flowVersion: 'v2',
        status: 'active',
        score: 0,
        priority: 1,
        scoreHistory: [],
        scoreSignals: [],
        answers: {},
        step: LeadConversationStep.V2Conversation,
      });
      expect(update.$unset).toHaveProperty('optedOutAt');
      expect(update.$unset).toHaveProperty('lastQuestionAt');
      expect(update.$unset).toHaveProperty('projectId');
    },
  );
});
