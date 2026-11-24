import { Types } from 'mongoose';
import type { LeadSessionSnapshot } from '../lead-conversation-session.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import { LeadFlowResolverService } from './lead-flow-resolver.service';

const buildSession = (overrides: Partial<LeadSessionSnapshot> = {}): LeadSessionSnapshot =>
  ({
    _id: new Types.ObjectId(),
    customerId: new Types.ObjectId(),
    waId: '573001112233',
    step: LeadConversationStep.Initial,
    status: 'active',
    flowVersion: 'v1',
    version: 3,
    ...overrides,
  }) as unknown as LeadSessionSnapshot;

const execResult = <T>(value: T): { exec: jest.Mock } => ({ exec: jest.fn().mockResolvedValue(value) });

const buildResolver = (input: {
  readonly campaign?: Record<string, unknown> | null;
  readonly settings?: Record<string, unknown>;
  readonly converted?: unknown;
  readonly refreshed?: unknown;
}) => {
  const mockCampaignModel = {
    findOne: jest.fn().mockReturnValue({
      sort: () => ({ select: () => ({ lean: () => execResult(input.campaign ?? null) }) }),
    }),
  };
  const mockSessionModel = { findOneAndUpdate: jest.fn().mockReturnValue(execResult(input.converted ?? null)) };
  const mockSettings = {
    executeGetOrCreate: jest.fn().mockResolvedValue({ enabled: true, defaultInboundFlow: 'v1', ...input.settings }),
  };
  const mockSessionService = { findById: jest.fn().mockResolvedValue(input.refreshed ?? null) };
  const resolver = new LeadFlowResolverService(
    mockCampaignModel as never,
    mockSessionModel as never,
    mockSettings as never,
    mockSessionService as never,
  );
  return { resolver, mockCampaignModel, mockSessionModel, mockSettings, mockSessionService };
};

describe('LeadFlowResolverService', () => {
  it('Given a session already on v2, When resolved, Then it stays v2 without any lookup', async () => {
    const inputSession = buildSession({ flowVersion: 'v2', step: LeadConversationStep.V2Conversation });
    const { resolver, mockCampaignModel, mockSettings } = buildResolver({});
    const actual = await resolver.executeResolve(inputSession);
    expect(actual).toEqual({ flowVersion: 'v2', session: inputSession });
    expect(mockCampaignModel.findOne).not.toHaveBeenCalled();
    expect(mockSettings.executeGetOrCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['a step other than initial', { step: LeadConversationStep.AskProject }],
    ['a question already asked', { lastQuestionAt: new Date() }],
  ])('Given a v1 session with %s, When resolved, Then it stays v1 without lookups', async (_label, overrides) => {
    const inputSession = buildSession(overrides as Partial<LeadSessionSnapshot>);
    const { resolver, mockCampaignModel } = buildResolver({ campaign: { flowStrategy: 'lead_conversation_v2' } });
    const actual = await resolver.executeResolve(inputSession);
    expect(actual).toEqual({ flowVersion: 'v1', session: inputSession });
    expect(mockCampaignModel.findOne).not.toHaveBeenCalled();
  });

  it('Given a fresh session and a v2 campaign, When resolved, Then it is converted to v2 with the form id', async () => {
    const inputSession = buildSession();
    const mockConverted = buildSession({ ...inputSession, flowVersion: 'v2', step: LeadConversationStep.V2Conversation });
    const { resolver, mockSessionModel } = buildResolver({
      campaign: { flowStrategy: 'lead_conversation_v2', formId: 'form-1' },
      converted: mockConverted,
    });
    const actual = await resolver.executeResolve(inputSession);
    expect(actual).toEqual({ flowVersion: 'v2', session: mockConverted });
    const [filter, update] = mockSessionModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ _id: inputSession._id });
    expect(update.$set).toMatchObject({
      flowVersion: 'v2',
      formId: 'form-1',
      step: LeadConversationStep.V2Conversation,
      leadProfile: { stage: 'opening', stageTurns: 0 },
    });
    expect(update.$inc).toEqual({ version: 1 });
  });

  it('Given a fresh session and a v1 campaign strategy, When resolved, Then it stays v1 even if v2 is the default', async () => {
    const inputSession = buildSession();
    const { resolver, mockSessionModel } = buildResolver({
      campaign: { flowStrategy: 'lead_conversation' },
      settings: { defaultInboundFlow: 'v2' },
    });
    const actual = await resolver.executeResolve(inputSession);
    expect(actual.flowVersion).toBe('v1');
    expect(mockSessionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['v2', 'v2'],
    ['v1', 'v1'],
  ])('Given no campaign row and default flow %s, When resolved, Then the flow is %s', async (defaultInboundFlow, expectedFlow) => {
    const inputSession = buildSession();
    const { resolver } = buildResolver({
      campaign: null,
      settings: { defaultInboundFlow },
      converted: buildSession({ flowVersion: 'v2' }),
    });
    const actual = await resolver.executeResolve(inputSession);
    expect(actual.flowVersion).toBe(expectedFlow);
  });

  it('Given a v2 target but the assistant disabled, When resolved, Then it falls back to v1 untouched', async () => {
    const inputSession = buildSession();
    const { resolver, mockSessionModel } = buildResolver({
      campaign: { flowStrategy: 'lead_conversation_v2' },
      settings: { enabled: false },
    });
    const actual = await resolver.executeResolve(inputSession);
    expect(actual).toEqual({ flowVersion: 'v1', session: inputSession });
    expect(mockSessionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('Given a concurrent conversion, When the update loses the race, Then the refreshed v2 snapshot is returned', async () => {
    const inputSession = buildSession();
    const mockRefreshed = buildSession({ flowVersion: 'v2' });
    const { resolver } = buildResolver({
      campaign: { flowStrategy: 'lead_conversation_v2' },
      converted: null,
      refreshed: mockRefreshed,
    });
    const actual = await resolver.executeResolve(inputSession);
    expect(actual).toEqual({ flowVersion: 'v2', session: mockRefreshed });
  });
});
