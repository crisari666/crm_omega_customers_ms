import { Types } from 'mongoose';
import type { LeadSessionSnapshot } from '../lead-conversation-session.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import { LeadAgentSideEffectsService } from './lead-agent-side-effects.service';

const mockSessionId = new Types.ObjectId();
const mockCustomerId = new Types.ObjectId();
const mockAnchorAt = new Date('2026-11-20T12:00:00.000Z');

const buildSession = (overrides: Partial<LeadSessionSnapshot> = {}): LeadSessionSnapshot =>
  ({
    _id: mockSessionId,
    customerId: mockCustomerId,
    waId: '573001112233',
    status: 'active',
    step: LeadConversationStep.V2Conversation,
    projectId: 'p1',
    projectTitle: 'Valle del Sol',
    leadProfile: { motivation: 'invest', paymentMethod: 'cash' },
    answers: {},
    recovery: { anchorAt: mockAnchorAt, sentStepIds: [] },
    ...overrides,
  }) as unknown as LeadSessionSnapshot;

const buildService = (briefFromLlm: string | null = 'Brief del LLM') => {
  const mocks = {
    configService: { get: jest.fn().mockReturnValue('lead-conversation-bot') },
    leadCustomer: { addInterestedProject: jest.fn().mockResolvedValue(undefined) },
    qualification: { executeQualify: jest.fn().mockResolvedValue(undefined) },
    captureSync: { executeUpsertPatch: jest.fn().mockResolvedValue(undefined) },
    dispatcher: { executeDispatch: jest.fn().mockResolvedValue(undefined) },
    faqResolver: { executeMarkUsed: jest.fn().mockResolvedValue(undefined) },
    unanswered: { executeCreate: jest.fn().mockResolvedValue(undefined) },
    recovery: { executeScheduleNext: jest.fn().mockResolvedValue(undefined) },
    llm: { executeBrief: jest.fn().mockResolvedValue(briefFromLlm) },
    sessionService: { setAdvisorBrief: jest.fn().mockResolvedValue(undefined) },
    eventModel: { updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }) },
  };
  const service = new LeadAgentSideEffectsService(
    mocks.configService as never,
    mocks.leadCustomer as never,
    mocks.qualification as never,
    mocks.captureSync as never,
    mocks.dispatcher as never,
    mocks.faqResolver as never,
    mocks.unanswered as never,
    mocks.recovery as never,
    mocks.llm as never,
    mocks.sessionService as never,
    mocks.eventModel as never,
  );
  return { service, ...mocks };
};

const outbound = [{ kind: 'text' as const, body: 'Hola' }];

describe('LeadAgentSideEffectsService', () => {
  it('Given a normal turn, When run, Then project, dispatch (no question timer), FAQs, unanswered and recovery are handled', async () => {
    const { service, leadCustomer, dispatcher, faqResolver, unanswered, recovery, qualification, llm } = buildService();
    await service.executeRun({
      session: buildSession(),
      transition: {
        nextStep: LeadConversationStep.V2Conversation,
        sessionPatch: { projectId: 'p1' },
        outbound,
        expectsReply: true,
      },
      usedFaqIds: ['faq-1'],
      unansweredQuestion: '¿Hay escritura individual?',
    });
    expect(leadCustomer.addInterestedProject).toHaveBeenCalledWith(mockCustomerId, 'p1', 'lead-conversation-bot');
    expect(dispatcher.executeDispatch).toHaveBeenCalledWith({
      sessionId: String(mockSessionId),
      customerId: String(mockCustomerId),
      to: '573001112233',
      messages: outbound,
    });
    expect(faqResolver.executeMarkUsed).toHaveBeenCalledWith(['faq-1']);
    expect(unanswered.executeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ question: '¿Hay escritura individual?', sessionId: String(mockSessionId), projectId: 'p1' }),
    );
    expect(recovery.executeScheduleNext).toHaveBeenCalledWith({
      sessionId: String(mockSessionId),
      anchorAt: mockAnchorAt.toISOString(),
      sentStepIds: [],
    });
    expect(qualification.executeQualify).not.toHaveBeenCalled();
    expect(llm.executeBrief).not.toHaveBeenCalled();
  });

  it('Given a session that is no longer active, When run, Then recovery is not scheduled', async () => {
    const { service, recovery } = buildService();
    await service.executeRun({
      session: buildSession({ status: 'disqualified' }),
      transition: { nextStep: LeadConversationStep.Closed, outbound, expectsReply: false },
    });
    expect(recovery.executeScheduleNext).not.toHaveBeenCalled();
  });

  it('Given a booked call, When run, Then the lead is qualified and the LLM brief is saved on the session and the pending events', async () => {
    const { service, qualification, recovery, sessionService, eventModel } = buildService();
    await service.executeRun({
      session: buildSession({ status: 'scheduled' }),
      transition: {
        nextStep: LeadConversationStep.Scheduled,
        status: 'scheduled',
        outbound,
        expectsReply: false,
        shouldQualify: true,
      },
    });
    expect(qualification.executeQualify).toHaveBeenCalledTimes(1);
    expect(recovery.executeScheduleNext).not.toHaveBeenCalled();
    expect(sessionService.setAdvisorBrief).toHaveBeenCalledWith(mockSessionId, 'Brief del LLM');
    expect(eventModel.updateMany).toHaveBeenCalledWith(
      { leadConversationSessionId: mockSessionId, status: 'pending' },
      { $set: { note: 'Brief del LLM' } },
    );
  });

  it('Given the LLM brief fails, When the call is booked, Then a Spanish profile-based brief is used', async () => {
    const { service, sessionService } = buildService(null);
    await service.executeRun({
      session: buildSession({ status: 'scheduled' }),
      transition: { nextStep: LeadConversationStep.Scheduled, status: 'scheduled', outbound, expectsReply: false },
    });
    const [, brief] = sessionService.setAdvisorBrief.mock.calls[0];
    expect(brief).toContain('Interesado en Valle del Sol');
    expect(brief).toContain('Motivación: Invertir');
    expect(brief).toContain('Forma de pago: De contado');
  });

  it('Given a failing side effect, When run, Then the other effects still happen', async () => {
    const { service, qualification, dispatcher } = buildService();
    qualification.executeQualify.mockRejectedValue(new Error('boom'));
    await service.executeRun({
      session: buildSession(),
      transition: { nextStep: LeadConversationStep.V2Conversation, outbound, expectsReply: true, shouldQualify: true },
    });
    expect(dispatcher.executeDispatch).toHaveBeenCalledTimes(1);
  });
});
