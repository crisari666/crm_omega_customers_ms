import { Types } from 'mongoose';
import { MetaLeadFormQualificationService } from './meta-lead-form-qualification.service';
import type { MetaLeadFormQualificationJobData } from './types/meta-lead-form-qualification-job.type';

const execResult = <T>(value: T): { exec: jest.Mock } => ({ exec: jest.fn().mockResolvedValue(value) });
const mockCustomerId = new Types.ObjectId();
const mockSessionId = new Types.ObjectId();

const mockJob: MetaLeadFormQualificationJobData = {
  leadgenId: 'lead-1',
  customerId: String(mockCustomerId),
  phone: '573001112233',
  contactName: 'Camila Rojas',
  flowStrategy: 'lead_conversation_v2',
  formId: 'form-1',
};

const mockWelcomeTemplate = { name: 'bienvenida_v2', language: 'es', bodyText: 'Hola {{1}}', bindings: [] };

const buildService = (input: { settings?: Record<string, unknown>; job?: MetaLeadFormQualificationJobData } = {}) => {
  const mockSessionModel = {
    findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => execResult(null) }) }),
    findOneAndUpdate: jest.fn().mockReturnValue(execResult({ _id: mockSessionId })),
  };
  const mockCampaignModel = {
    findOne: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ graphCampaignId: 'c1', qualificationOutboundSentAt: undefined }),
    }),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const mockMessageModel = { create: jest.fn().mockResolvedValue({}) };
  const mockWsClient = { send: jest.fn().mockReturnValue({ pipe: () => ({ subscribe: undefined }) }) };
  const mockConfig = {
    get: jest.fn((key: string) => (key === 'leadConversation.phoneNumberId' ? '111' : undefined)),
  };
  const mockSettings = {
    executeGetOrCreate: jest.fn().mockResolvedValue({
      enabled: true,
      assistantName: 'Sofía',
      businessName: 'GTower',
      welcomeTemplate: mockWelcomeTemplate,
      ...input.settings,
    }),
  };
  const mockRenderer = {
    executeRender: jest.fn().mockReturnValue({ templateComponents: [{ type: 'body' }], renderedBody: 'Hola Camila' }),
  };
  const mockRecovery = { executeScheduleNext: jest.fn().mockResolvedValue(undefined) };
  const mockAdLookup = {
    executeFindEnabledByCampaignId: jest.fn().mockResolvedValue({
      projectId: 'p1',
      projectTitle: 'Valle del Sol',
    }),
  };
  const service = new MetaLeadFormQualificationService(
    mockSessionModel as never,
    mockCampaignModel as never,
    mockMessageModel as never,
    mockWsClient as never,
    mockConfig as never,
    mockSettings as never,
    mockRenderer as never,
    mockRecovery as never,
    mockAdLookup as never,
  );
  return {
    service,
    mockSessionModel,
    mockCampaignModel,
    mockMessageModel,
    mockWsClient,
    mockRenderer,
    mockRecovery,
    mockAdLookup,
  };
};

jest.mock('rxjs', () => ({
  ...jest.requireActual('rxjs'),
  lastValueFrom: jest.fn().mockResolvedValue({ success: true, wamid: 'wamid.out' }),
}));

describe('MetaLeadFormQualificationService V2 welcome', () => {
  it('Given a v2 job with a welcome template, When the delay fires, Then the rendered template is sent and a v2 session starts', async () => {
    const { service, mockWsClient, mockRenderer, mockSessionModel, mockMessageModel, mockRecovery } = buildService();
    await service.executeDelayedOutbound(mockJob);
    expect(mockRenderer.executeRender).toHaveBeenCalledWith(
      mockWelcomeTemplate,
      expect.objectContaining({ firstName: 'Camila', projectTitle: 'Valle del Sol', businessName: 'GTower' }),
    );
    expect(mockWsClient.send).toHaveBeenCalledWith(
      'lead_conversation.send.v1',
      expect.objectContaining({ templateName: 'bienvenida_v2', languageCode: 'es', templateComponents: [{ type: 'body' }] }),
    );
    const [filter, update] = mockSessionModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ waId: '573001112233', phoneNumberId: '111' });
    expect(update.$set).toMatchObject({
      flowVersion: 'v2',
      formId: 'form-1',
      step: 'v2_conversation',
      leadProfile: { stage: 'opening', stageTurns: 0 },
      recovery: { sentStepIds: [] },
      projectId: 'p1',
      projectTitle: 'Valle del Sol',
    });
    expect(mockMessageModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'outbound', kind: 'template', body: 'Hola Camila', templateName: 'bienvenida_v2', wamid: 'wamid.out' }),
    );
    expect(mockRecovery.executeScheduleNext).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: String(mockSessionId), sentStepIds: [] }),
    );
  });

  it('Given a mapped campaign without a project id, When the delay fires, Then the v2 session starts without project fields', async () => {
    const { service, mockSessionModel, mockAdLookup } = buildService();
    mockAdLookup.executeFindEnabledByCampaignId.mockResolvedValue({ projectTitle: 'Valle del Sol' });
    await service.executeDelayedOutbound(mockJob);
    const [, update] = mockSessionModel.findOneAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty('projectId');
    expect(update.$set).not.toHaveProperty('projectTitle');
  });

  it.each([
    ['the assistant is disabled', { enabled: false }],
    ['there is no welcome template', { welcomeTemplate: undefined }],
  ])('Given %s, When the delay fires, Then the V1 template is sent and no v2 session starts', async (_label, settings) => {
    const { service, mockWsClient, mockRenderer, mockSessionModel } = buildService({ settings });
    await service.executeDelayedOutbound(mockJob);
    expect(mockRenderer.executeRender).not.toHaveBeenCalled();
    expect(mockWsClient.send).toHaveBeenCalledWith(
      'lead_conversation.send.v1',
      expect.objectContaining({ templateName: expect.not.stringMatching(/bienvenida_v2/) }),
    );
    expect(mockSessionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('Given a v1 job, When the delay fires, Then the assistant settings are ignored', async () => {
    const { service, mockRenderer, mockSessionModel } = buildService();
    await service.executeDelayedOutbound({ ...mockJob, flowStrategy: 'lead_conversation' });
    expect(mockRenderer.executeRender).not.toHaveBeenCalled();
    expect(mockSessionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
