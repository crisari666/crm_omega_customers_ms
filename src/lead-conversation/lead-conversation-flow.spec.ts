import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { REPLY_ID } from './constants/lead-conversation.constants';
import { AskCallSlotHandler } from './handlers/ask-call-slot.handler';
import { AskLotRangeHandler } from './handlers/ask-lot-range.handler';
import { LeadCallSlotService } from './lead-call-slot.service';
import { AskPaymentHandler } from './handlers/ask-payment.handler';
import { AskProjectHandler } from './handlers/ask-project.handler';
import { AskScheduleHandler } from './handlers/ask-schedule.handler';
import { InitialHandler } from './handlers/initial.handler';
import { ReminderReplyHandler } from './handlers/reminder-reply.handler';
import { TerminalHandler } from './handlers/terminal.handler';
import type { LeadSessionSnapshot } from './lead-conversation-session.service';
import { LeadConversationStateMachineService } from './lead-conversation-state-machine.service';
import { LeadFlowTransitionsService } from './lead-flow-transitions.service';
import { LeadMessageComposerService } from './lead-message-composer.service';
import { LeadScoringService } from './lead-scoring.service';
import { ProjectCatalogService } from './project-catalog.service';
import { ProjectMatcherService } from './project-matcher.service';
import type { InboundLeadMessage } from './types/inbound-lead-message.type';
import { LeadConversationStep } from './types/lead-conversation-step.enum';
import { LEAD_STEP_HANDLERS, type LeadStepHandler } from './types/lead-step-handler.interface';
import type { LeadProject } from './types/lead-project.type';
import type { StepTransition } from './types/step-transition.type';

const mockProject: LeadProject = {
  id: 'p1',
  title: 'Valle del Sol',
  shortDescription: 'Lotes campestres con vista a la montaña.',
  plane: 'plane_valle.png',
  lotOptions: [
    { area: 300, price: 51000000 },
    { area: 400, price: 56000000 },
    { area: 1000, price: 80000000 },
    { area: 1200, price: 95000000 },
  ],
};

const HANDLERS = [
  InitialHandler,
  AskProjectHandler,
  AskLotRangeHandler,
  AskPaymentHandler,
  AskScheduleHandler,
  AskCallSlotHandler,
  ReminderReplyHandler,
  TerminalHandler,
];

/** Thursday 2026-10-15 19:00 Bogota. */
const SLOT_START = new Date('2026-10-16T00:00:00.000Z');

const buildMessage = (text: string, replyId?: string): InboundLeadMessage => ({
  wamid: `wamid.${Math.random()}`,
  waId: '573001112233',
  phoneNumberId: '111',
  profileName: 'Ana María',
  type: replyId ? 'interactive' : 'text',
  text,
  replyId,
  timestamp: new Date(),
});

const buildSession = (): LeadSessionSnapshot =>
  ({
    _id: new Types.ObjectId(),
    customerId: new Types.ObjectId(),
    waId: '573001112233',
    phoneNumberId: '111',
    profileName: 'Ana María',
    firstName: 'Ana',
    step: LeadConversationStep.Initial,
    status: 'active',
    isAllProjects: false,
    answers: {},
    score: 0,
    priority: 1,
    scoreHistory: [],
    pendingOptions: [],
    lastQuestion: [],
    retryCount: 0,
    version: 0,
  }) as unknown as LeadSessionSnapshot;

/** In-memory equivalent of LeadConversationSessionService.applyTransition. */
function applyInMemory(scoring: LeadScoringService, session: LeadSessionSnapshot, transition: StepTransition): LeadSessionSnapshot {
  const scoreState = transition.scoreEvent ? scoring.applyScoreEvent(session, transition.scoreEvent) : session;
  const last = transition.outbound[transition.outbound.length - 1];
  const hasQuestion = transition.expectsReply && (last?.options ?? []).length > 0;
  return {
    ...session,
    ...(transition.sessionPatch ?? {}),
    step: transition.nextStep,
    status: transition.status ?? session.status,
    answers: { ...session.answers, ...(transition.answersPatch ?? {}) },
    score: scoreState.score,
    priority: scoreState.priority,
    scoreHistory: [...scoreState.scoreHistory],
    retryCount: transition.isRetry ? session.retryCount + 1 : 0,
    ...(hasQuestion ? { pendingOptions: [...(last?.options ?? [])], lastQuestion: [...transition.outbound] } : {}),
  } as LeadSessionSnapshot;
}

describe('Lead conversation flow (state machine + handlers + composer)', () => {
  let stateMachine: LeadConversationStateMachineService;
  let scoring: LeadScoringService;
  const mockMatcher = { findProjectInText: jest.fn() };
  const mockCatalog = {
    getProjects: jest.fn(),
    findProjectById: jest.fn().mockResolvedValue(mockProject),
    buildPlaneUrl: jest.fn().mockReturnValue('https://rag.example.com/rag/uploads/projects/plane_valle.png'),
  };

  const mockCallSlots = { findFreeSlots: jest.fn(), bookSlot: jest.fn() };

  beforeEach(async () => {
    mockCatalog.getProjects.mockReset().mockResolvedValue([mockProject]);
    mockCallSlots.findFreeSlots.mockReset().mockResolvedValue([{ start: SLOT_START, period: 'night' }]);
    mockCallSlots.bookSlot
      .mockReset()
      .mockResolvedValue({ booked: true, eventId: 'e1', userId: 'u1', scheduledAt: SLOT_START });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ...HANDLERS,
        { provide: LEAD_STEP_HANDLERS, inject: HANDLERS, useFactory: (...h: LeadStepHandler[]) => h },
        LeadConversationStateMachineService,
        LeadFlowTransitionsService,
        LeadMessageComposerService,
        LeadScoringService,
        { provide: ProjectMatcherService, useValue: mockMatcher },
        { provide: ProjectCatalogService, useValue: mockCatalog },
        { provide: LeadCallSlotService, useValue: mockCallSlots },
        { provide: ConfigService, useValue: { get: (_key: string, fallback: unknown) => fallback } },
      ],
    }).compile();
    stateMachine = moduleRef.get(LeadConversationStateMachineService);
    scoring = moduleRef.get(LeadScoringService);
    mockMatcher.findProjectInText.mockReset();
  });

  it('Given a first message naming a project, When the customer answers every step, Then score is 6 and the lead qualifies', async () => {
    mockMatcher.findProjectInText.mockResolvedValue(mockProject);
    let session = buildSession();
    const intro = await stateMachine.executeTransition(session, buildMessage('Info de Valle del Sol'));
    expect(intro.nextStep).toBe(LeadConversationStep.AskLotRange);
    expect(intro.outbound.map((message) => message.kind)).toEqual(['text', 'image', 'list']);
    expect(intro.outbound[1].delayMs).toBe(3000);
    expect(intro.outbound[2].delayMs).toBe(4000);
    session = applyInMemory(scoring, session, intro);
    const lot = await stateMachine.executeTransition(session, buildMessage('300 m²', 'lot:300'));
    expect(lot.answersPatch).toEqual({ rangoLote: '300 m²' });
    session = applyInMemory(scoring, session, lot);
    const payment = await stateMachine.executeTransition(session, buildMessage('quiero financiado'));
    expect(payment.outbound[0].body).toContain('financiación directa con la');
    expect(payment.outbound[0].options?.map((option) => option.id)).toEqual([
      REPLY_ID.slotMorning,
      REPLY_ID.slotAfternoon,
      REPLY_ID.slotNight,
    ]);
    session = applyInMemory(scoring, session, payment);
    const period = await stateMachine.executeTransition(session, buildMessage('Noche 6-9', REPLY_ID.slotNight));
    expect(mockCallSlots.findFreeSlots).toHaveBeenCalledWith('night');
    expect(period.nextStep).toBe(LeadConversationStep.AskCallSlot);
    expect(period.outbound[0].kind).toBe('list');
    expect(period.outbound[0].options?.[0].id).toBe(`callslot:${SLOT_START.toISOString()}`);
    session = applyInMemory(scoring, session, period);
    const booked = await stateMachine.executeTransition(session, buildMessage('1'));
    session = applyInMemory(scoring, session, booked);
    expect(mockCallSlots.bookSlot).toHaveBeenCalledWith(expect.objectContaining({ slotStart: SLOT_START }));
    expect(booked.shouldQualify).toBe(true);
    expect(booked.outbound[0].body).toContain('jueves 15 de octubre, 7:00 p. m.');
    expect(session).toMatchObject({ step: LeadConversationStep.Scheduled, status: 'scheduled', score: 6, priority: 3 });
    expect(session.answers).toMatchObject({ horarioLlamada: 'night', fechaLlamada: SLOT_START.toISOString() });
  });

  it('Given the slot list was sent, When the picked slot got taken meanwhile, Then a fresh list is resent with a notice', async () => {
    mockCallSlots.bookSlot.mockResolvedValueOnce({ booked: false });
    const slotId = `callslot:${SLOT_START.toISOString()}`;
    const session = {
      ...buildSession(),
      step: LeadConversationStep.AskCallSlot,
      answers: { horarioLlamada: 'night' },
      pendingOptions: [{ id: slotId, title: 'jue 15 oct · 7:00 p. m.' }],
    } as LeadSessionSnapshot;
    const actual = await stateMachine.executeTransition(session, buildMessage('jue 15 oct · 7:00 p. m.', slotId));
    expect(actual.nextStep).toBe(LeadConversationStep.AskCallSlot);
    expect(actual.outbound.map((message) => message.kind)).toEqual(['text', 'list']);
    expect(actual.outbound[0].body).toContain('acaba de ser tomado');
  });

  it('Given a period without free slots, When the customer picks it, Then the bot asks for another period', async () => {
    mockCallSlots.findFreeSlots.mockResolvedValueOnce([]);
    const session = { ...buildSession(), step: LeadConversationStep.AskSchedule } as LeadSessionSnapshot;
    const actual = await stateMachine.executeTransition(session, buildMessage('Mañana 9-12', REPLY_ID.slotMorning));
    expect(actual.nextStep).toBe(LeadConversationStep.AskSchedule);
    expect(actual.outbound[0].body).toContain('no tenemos espacios libres');
    expect(actual.outbound[0].kind).toBe('buttons');
  });

  it('Given a greeting, When the customer picks "Me interesan todos", Then it jumps to scheduling', async () => {
    mockMatcher.findProjectInText.mockResolvedValue(undefined);
    let session = buildSession();
    const ask = await stateMachine.executeTransition(session, buildMessage('Hola'));
    expect(ask.nextStep).toBe(LeadConversationStep.AskProject);
    expect(ask.outbound[0].options?.map((option) => option.id)).toContain(REPLY_ID.allProjects);
    session = applyInMemory(scoring, session, ask);
    const all = await stateMachine.executeTransition(session, buildMessage('✨ Me interesan todos', REPLY_ID.allProjects));
    expect(all.nextStep).toBe(LeadConversationStep.AskSchedule);
    expect(all.sessionPatch).toEqual({ isAllProjects: true });
  });

  it('Given the reminder was sent, When the customer answers No, Then the lead is disqualified with score 1', async () => {
    let session = buildSession();
    session = {
      ...session,
      step: LeadConversationStep.ReminderSent,
      stepBeforeReminder: LeadConversationStep.AskPayment,
      score: 1,
      pendingOptions: [
        { id: REPLY_ID.reminderYes, title: 'Sí' },
        { id: REPLY_ID.reminderNo, title: 'No' },
      ],
    } as LeadSessionSnapshot;
    const declined = await stateMachine.executeTransition(session, buildMessage('No', REPLY_ID.reminderNo));
    session = applyInMemory(scoring, session, declined);
    expect(session).toMatchObject({ step: LeadConversationStep.Closed, status: 'disqualified', score: 1, priority: 1 });
  });

  it('Given the project list was sent with an empty catalog, When the customer replies unclear text after it loads, Then the retry lists every project', async () => {
    mockMatcher.findProjectInText.mockResolvedValue(undefined);
    mockCatalog.getProjects.mockResolvedValue([]);
    let session = buildSession();
    const ask = await stateMachine.executeTransition(session, buildMessage('Hola'));
    expect(ask.outbound[0].options?.map((option) => option.id)).toEqual([REPLY_ID.allProjects]);
    session = applyInMemory(scoring, session, ask);
    const secondProject: LeadProject = { ...mockProject, id: 'p2', title: 'Villa del Olimpo' };
    mockCatalog.getProjects.mockResolvedValue([mockProject, secondProject]);
    const retry = await stateMachine.executeTransition(session, buildMessage('Hola'));
    const expectedIds = [`${REPLY_ID.projectPrefix}p1`, `${REPLY_ID.projectPrefix}p2`, REPLY_ID.allProjects];
    expect(retry.isRetry).toBe(true);
    expect(retry.outbound[retry.outbound.length - 1].options?.map((option) => option.id)).toEqual(expectedIds);
  });

  it('Given an unclear answer, When asked twice already, Then the bot stays silent', async () => {
    const session = { ...buildSession(), step: LeadConversationStep.AskPayment, retryCount: 2 } as LeadSessionSnapshot;
    const actual = await stateMachine.executeTransition(session, buildMessage('mmm no sé'));
    expect(actual.outbound).toHaveLength(0);
  });
});
