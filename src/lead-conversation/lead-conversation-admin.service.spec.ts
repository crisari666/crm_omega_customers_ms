import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Customer } from '../customer/schemas/customer.schema';
import { LeadAssistantSettingsService } from '../lead-assistant/lead-assistant-settings.service';
import { LeadConversationAdminService } from './lead-conversation-admin.service';
import { LeadFlowTransitionsService } from './lead-flow-transitions.service';
import { LeadMessageDispatcherService } from './lead-message-dispatcher.service';
import { LeadRecoveryScheduler } from '../lead-assistant/lead-recovery.scheduler';
import { LeadReminderScheduler } from './lead-reminder.scheduler';
import { LeadConversationMessage } from './schemas/lead-conversation-message.schema';
import { LeadConversationSession } from './schemas/lead-conversation-session.schema';
import { LeadConversationStep } from './types/lead-conversation-step.enum';
import type { StepTransition } from './types/step-transition.type';

const HOUR_MS = 60 * 60 * 1000;

const execResult = <T>(value: T): { exec: jest.Mock } => ({ exec: jest.fn().mockResolvedValue(value) });
const leanResult = <T>(value: T): { lean: () => { exec: jest.Mock } } => ({ lean: () => execResult(value) });

describe('LeadConversationAdminService', () => {
  let service: LeadConversationAdminService;
  const mockSessionId = new Types.ObjectId();
  const mockSession = {
    _id: mockSessionId,
    customerId: new Types.ObjectId(),
    waId: '573001112233',
    firstName: 'Ana',
    step: LeadConversationStep.AskPayment,
    status: 'active',
    score: 1,
    lastInboundAt: new Date(),
  };
  const mockSessionModel = { findById: jest.fn(), updateOne: jest.fn(), deleteOne: jest.fn() };
  const mockMessageModel = { deleteMany: jest.fn(), findOne: jest.fn() };
  const mockReminder = { executeCancel: jest.fn() };
  const mockRecovery = { executeCancel: jest.fn() };
  const mockDispatcher = { executeDispatch: jest.fn() };
  const mockQuestion = { kind: 'list', body: 'Cuál proyecto?', options: [{ id: 'project:all', title: 'Todos' }] };
  const mockTransitions = {
    buildAskProject: jest.fn().mockResolvedValue({
      nextStep: LeadConversationStep.AskProject,
      outbound: [mockQuestion],
      expectsReply: true,
    } as StepTransition),
  };
  const mockSettings = {
    executeGetOrCreate: jest.fn().mockResolvedValue({ enabled: false, defaultInboundFlow: 'v1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSessionModel.updateOne.mockReturnValue(execResult({}));
    mockSessionModel.deleteOne.mockReturnValue(execResult({}));
    mockMessageModel.deleteMany.mockReturnValue(execResult({}));
    mockSettings.executeGetOrCreate.mockResolvedValue({ enabled: false, defaultInboundFlow: 'v1' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeadConversationAdminService,
        { provide: getModelToken(LeadConversationSession.name), useValue: mockSessionModel },
        { provide: getModelToken(LeadConversationMessage.name), useValue: mockMessageModel },
        { provide: getModelToken(Customer.name), useValue: {} },
        { provide: LeadReminderScheduler, useValue: mockReminder },
        { provide: LeadRecoveryScheduler, useValue: mockRecovery },
        { provide: LeadFlowTransitionsService, useValue: mockTransitions },
        { provide: LeadMessageDispatcherService, useValue: mockDispatcher },
        { provide: LeadAssistantSettingsService, useValue: mockSettings },
      ],
    }).compile();
    service = moduleRef.get(LeadConversationAdminService);
  });

  it('Given an existing session, When deleted, Then the reminder is cancelled and session + transcript removed', async () => {
    mockSessionModel.findById.mockReturnValue(leanResult(mockSession));
    const actual = await service.deleteSession(String(mockSessionId));
    expect(actual).toEqual({ deleted: true });
    expect(mockReminder.executeCancel).toHaveBeenCalledWith(String(mockSessionId));
    expect(mockRecovery.executeCancel).toHaveBeenCalledWith(String(mockSessionId));
    expect(mockMessageModel.deleteMany).toHaveBeenCalledWith({ sessionId: mockSessionId });
    expect(mockSessionModel.deleteOne).toHaveBeenCalledWith({ _id: mockSessionId });
  });

  it('Given a missing session, When deleted, Then NotFoundException is thrown', async () => {
    mockSessionModel.findById.mockReturnValue(leanResult(null));
    await expect(service.deleteSession(String(mockSessionId))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Given a recent inbound and assistant disabled, When restarted, Then answers reset to ask_project and the welcome list is sent', async () => {
    mockSessionModel.findById.mockReturnValue(leanResult(mockSession));
    const actual = await service.restartSession(String(mockSessionId));
    expect(actual).toEqual({ restarted: true, sent: true });
    const [, update] = mockSessionModel.updateOne.mock.calls[0];
    expect(update.$set).toMatchObject({ step: LeadConversationStep.AskProject, score: 0, answers: {}, status: 'active' });
    expect(update.$unset).toHaveProperty('projectId');
    expect(mockDispatcher.executeDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ to: mockSession.waId, messages: [mockQuestion] }),
    );
  });

  it('Given the last inbound is older than 24h and assistant disabled, When restarted, Then it only resets to initial without sending', async () => {
    const expectedStaleInbound = new Date(Date.now() - 25 * HOUR_MS);
    mockSessionModel.findById.mockReturnValue(leanResult({ ...mockSession, lastInboundAt: expectedStaleInbound }));
    const actual = await service.restartSession(String(mockSessionId));
    expect(actual).toEqual({ restarted: true, sent: false, reason: 'outside_customer_service_window' });
    expect(mockSessionModel.updateOne.mock.calls[0][1].$set.step).toBe(LeadConversationStep.Initial);
    expect(mockDispatcher.executeDispatch).not.toHaveBeenCalled();
  });

  it('Given a V1 session and assistant enabled, When restarted, Then it converts to V2 without sending the project list', async () => {
    mockSettings.executeGetOrCreate.mockResolvedValue({ enabled: true, defaultInboundFlow: 'v1' });
    const mockLastInboundId = new Types.ObjectId();
    mockSessionModel.findById.mockReturnValue(leanResult(mockSession));
    mockMessageModel.findOne.mockReturnValue({
      sort: () => ({ select: () => leanResult({ _id: mockLastInboundId }) }),
    });
    const actual = await service.restartSession(String(mockSessionId));
    expect(actual).toEqual({ restarted: true, sent: false, reason: 'v2_waits_for_customer' });
    expect(mockRecovery.executeCancel).toHaveBeenCalledWith(String(mockSessionId));
    const [, update] = mockSessionModel.updateOne.mock.calls[0];
    expect(update.$set).toMatchObject({
      flowVersion: 'v2',
      step: LeadConversationStep.V2Conversation,
      status: 'active',
      score: 0,
      lastTurnMessageId: String(mockLastInboundId),
    });
    expect(mockDispatcher.executeDispatch).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskProject).not.toHaveBeenCalled();
  });

  it('Given a V2 session, When restarted, Then it resets to a clean V2 conversation, cancels recovery and sends nothing', async () => {
    const mockLastInboundId = new Types.ObjectId();
    mockSessionModel.findById.mockReturnValue(leanResult({ ...mockSession, flowVersion: 'v2' }));
    mockMessageModel.findOne.mockReturnValue({
      sort: () => ({ select: () => leanResult({ _id: mockLastInboundId }) }),
    });
    const actual = await service.restartSession(String(mockSessionId));
    expect(actual).toEqual({ restarted: true, sent: false, reason: 'v2_waits_for_customer' });
    expect(mockRecovery.executeCancel).toHaveBeenCalledWith(String(mockSessionId));
    const [, update] = mockSessionModel.updateOne.mock.calls[0];
    expect(update.$set).toMatchObject({
      flowVersion: 'v2',
      step: LeadConversationStep.V2Conversation,
      status: 'active',
      score: 0,
      priority: 1,
      scoreSignals: [],
      lastTurnMessageId: String(mockLastInboundId),
    });
    expect(update.$unset).toHaveProperty('optedOutAt');
    expect(update.$unset).toHaveProperty('projectId');
    expect(update.$unset).toHaveProperty('projectTitle');
    expect(mockDispatcher.executeDispatch).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskProject).not.toHaveBeenCalled();
    expect(mockSettings.executeGetOrCreate).not.toHaveBeenCalled();
  });
});
