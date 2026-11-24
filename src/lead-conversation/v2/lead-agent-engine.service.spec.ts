import { Types } from 'mongoose';
import { LEAD_AGENT_REPLY_GAP_MS } from '../constants/lead-conversation.constants';
import { LEAD_TEMPLATES } from '../templates/lead-conversation.templates';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { StepTransition } from '../types/step-transition.type';
import {
  LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY,
  LEAD_AGENT_FALLBACK_BUYER_CONTINUE_REPLY,
  LEAD_AGENT_FALLBACK_EXPLORING_REPLY,
  LEAD_AGENT_FALLBACK_REPLY,
  LEAD_AGENT_OPT_OUT_REPLY,
} from './constants/lead-agent.constants';
import { LeadAgentEngineService } from './lead-agent-engine.service';
import { LeadAgentPromptBuilder } from './lead-agent-prompt.builder';
import { LeadAgentScoringService } from './lead-agent-scoring.service';
import { LeadAgentStageService } from './lead-agent-stage.service';
import type { LeadAgentLlmTurn } from './types/lead-agent-llm-turn.type';
import type { LeadAgentSessionView } from './types/lead-agent-session-view.type';
import type { LeadAgentTurnInput } from './types/lead-agent-turn-input.type';
import type { ProjectKnowledge } from './types/project-knowledge.type';

const mockProject: ProjectKnowledge = {
  id: 'p1',
  title: 'Valle del Sol',
  shortDescription: 'Lotes campestres en Carmen de Apicalá con construcción libre.',
  description: 'Descripción',
  location: 'Tolima',
  city: 'Carmen',
  state: 'Tolima',
  lotOptions: [
    { area: 300, price: 51_000_000 },
    { area: 500, price: 68_000_000 },
  ],
  amenitiesGroups: [],
  planeUrl: 'https://rag.test/plane.pdf',
  videoUrl: 'https://rag.test/video.mp4',
  brochureUrl: 'https://rag.test/brochure.pdf',
  financing: {
    separation: 500_000,
    installments: 36,
    minMonthlyPayment: 1_403_000,
    plans: [
      { area: 300, price: 51_000_000, monthlyPayment: 1_403_000 },
      { area: 500, price: 68_000_000, monthlyPayment: 1_875_000 },
    ],
  },
};

const mockSettings = {
  assistantName: 'Verónica',
  businessName: 'La Ceiba',
  greeting: 'Hola {{customerName}}',
  pricePolicy: 'entry_ticket_first',
};

const buildTurn = (overrides: Partial<LeadAgentLlmTurn> = {}): LeadAgentLlmTurn => ({
  replies: ['Hola Camila, ¿buscas construir o invertir?'],
  profile: {},
  intents: [],
  action: 'continue',
  media: [],
  callPeriod: null,
  projectId: null,
  usedFaqIds: [],
  unansweredQuestion: null,
  ...overrides,
});

const buildSession = (overrides: Partial<LeadAgentSessionView> = {}): LeadAgentSessionView => ({
  firstName: 'Camila',
  step: LeadConversationStep.V2Conversation,
  status: 'active',
  projectId: 'p1',
  projectTitle: 'Valle del Sol',
  leadProfile: {},
  scoreSignals: [],
  answers: {},
  pendingOptions: [],
  ...overrides,
});

const buildInput = (session: LeadAgentSessionView = buildSession()): LeadAgentTurnInput => ({
  session,
  history: [{ direction: 'inbound', body: 'Hola, ya habíamos escrito' }],
  pendingMessages: [{ text: 'Hola' }],
});

const mockAskSchedule: StepTransition = {
  nextStep: LeadConversationStep.AskSchedule,
  outbound: [{ kind: 'buttons', body: '¿Cuándo te llamamos?', options: [{ id: 'slot:morning', title: 'Mañana' }] }],
  expectsReply: true,
};

const mockAskCallSlot: StepTransition = {
  nextStep: LeadConversationStep.AskCallSlot,
  answersPatch: { horarioLlamada: 'morning' },
  outbound: [{ kind: 'list', body: 'Elige un horario', options: [{ id: 'slot:1', title: 'Lunes 9:00' }] }],
  expectsReply: true,
};

const mockProjectPicker: StepTransition = {
  nextStep: LeadConversationStep.V2Conversation,
  outbound: [
    {
      kind: 'list',
      body: '¡Con mucho gusto te comparto información! Tenemos diferentes proyectos y quisiera orientarte sobre el que más te interese. ¿Cuál te gustaría conocer?',
      options: [
        { id: 'project:p1', title: '🏡 Valle del Sol' },
        { id: 'project:all', title: '✨ Me interesan todos' },
      ],
    },
  ],
  expectsReply: true,
};

const motivationOptions = [
  { id: 'mot:build', title: '🏗️ Construir' },
  { id: 'mot:invest', title: '📈 Inversión' },
  { id: 'mot:exploring', title: '👀 Solo explorando' },
] as const;

const buildAskMotivationTransition = (body: string): StepTransition => ({
  nextStep: LeadConversationStep.V2Conversation,
  outbound: [{ kind: 'buttons', body, options: [...motivationOptions] }],
  expectsReply: true,
});

const buildEngine = (
  turn: LeadAgentLlmTurn | null,
  settings: Partial<typeof mockSettings> = {},
) => {
  const mockLlm = { executeTurn: jest.fn().mockResolvedValue(turn) };
  const mockKnowledge = {
    executeGetById: jest.fn().mockImplementation(async (id: string) => (id === 'p1' ? mockProject : undefined)),
    executeGetCatalogSummary: jest.fn().mockResolvedValue([{ id: 'p1', title: 'Valle del Sol', location: 'Tolima' }]),
  };
  const mockTransitions = {
    buildAskSchedule: jest.fn().mockReturnValue(mockAskSchedule),
    buildAskCallSlot: jest.fn().mockResolvedValue(mockAskCallSlot),
    buildProjectPicker: jest.fn().mockResolvedValue(mockProjectPicker),
    buildAskMotivation: jest.fn().mockImplementation((body?: string) =>
      buildAskMotivationTransition(body ?? '¿Lo estás mirando para construir, como inversión, o solo explorando?'),
    ),
    buildProjectTeaser: jest.fn().mockImplementation((project: { title: string; shortDescription: string }) => ({
      nextStep: LeadConversationStep.V2Conversation,
      outbound: [
        {
          kind: 'text',
          body:
            project.shortDescription.trim().length > 0
              ? `Perfecto. 🌿 ${project.title}\n\n${project.shortDescription.trim()}`
              : `Perfecto. 🌿 ${project.title}`,
        },
      ],
      expectsReply: false,
    })),
    buildAskTimeToBuy: jest.fn().mockImplementation((body?: string) => ({
      nextStep: LeadConversationStep.V2Conversation,
      outbound: [
        {
          kind: 'list',
          body: body ?? 'plazo',
          options: [
            { id: 'time:immediate', title: 'Compra inmediata' },
            { id: 'time:within_30_days', title: 'Compra en 30 días' },
            { id: 'time:within_3_months', title: 'Compra en 3 meses' },
            { id: 'time:future', title: 'Compra futura' },
            { id: 'time:not_now', title: 'No comprar ahora' },
          ],
        },
      ],
      expectsReply: true,
    })),
    buildAskPaymentCapture: jest.fn().mockReturnValue({
      nextStep: LeadConversationStep.V2Conversation,
      outbound: [{ kind: 'buttons', body: 'pago', options: [] }],
      expectsReply: true,
    }),
    buildFinancingOffer: jest.fn().mockReturnValue({
      nextStep: LeadConversationStep.V2Conversation,
      outbound: [{ kind: 'text', body: 'cuotas desde $1.403.000' }],
      expectsReply: false,
    }),
    buildFinancingLotPicker: jest.fn().mockReturnValue({
      nextStep: LeadConversationStep.V2Conversation,
      outbound: [
        {
          kind: 'buttons',
          body:
            'Perfecto, en Valle del Sol contamos con planes financiados para nuestros lotes con planes desde:\n' +
            '- 300 m²: *$1.403.000* pesos mensuales\n\n- 500 m²: *$1.875.000* pesos mensuales\n\n¿Cuál te interesa?',
          options: [
            { id: 'lot:300', title: '300 m²', description: '$1.403.000/mes' },
            { id: 'lot:500', title: '500 m²', description: '$1.875.000/mes' },
          ],
        },
      ],
      expectsReply: true,
    }),
    buildLotChoiceAck: jest.fn().mockImplementation((area: number) => ({
      nextStep: LeadConversationStep.V2Conversation,
      outbound: [{ kind: 'text', body: `Excelente elección el de ${area} m².` }],
      expectsReply: false,
    })),
    buildAskNextStep: jest.fn().mockReturnValue({
      nextStep: LeadConversationStep.V2Conversation,
      outbound: [{ kind: 'buttons', body: 'siguiente', options: [] }],
      expectsReply: true,
    }),
    buildAskUrgency: jest.fn().mockReturnValue({
      nextStep: LeadConversationStep.V2Conversation,
      outbound: [{ kind: 'buttons', body: 'urgencia', options: [] }],
      expectsReply: true,
    }),
    buildAskDecisionMaker: jest.fn().mockReturnValue({
      nextStep: LeadConversationStep.V2Conversation,
      outbound: [{ kind: 'list', body: 'decisión', options: [] }],
      expectsReply: true,
    }),
  };
  const mockAdResolver = { executeResolveForCustomer: jest.fn().mockResolvedValue(undefined) };
  const mockFaqResolver = {
    executeResolve: jest.fn().mockResolvedValue([
      { id: 'f1', question: '¿Precio?', answer: 'Desde 85M', category: 'price', alternativePhrasings: [] },
    ]),
  };
  const mockCaptureSync = {
    executeGetCaptureKnown: jest.fn().mockResolvedValue({
      known: {},
      missingCaptureFields: ['buyMotive', 'timeToBuy', 'paymentMethod', 'urgencyLevel', 'decisionMaker'],
      nextCaptureField: 'buyMotive',
      values: {},
    }),
    executeUpsertPatch: jest.fn().mockResolvedValue(undefined),
    buildPatchFromProfileAndForm: jest.fn().mockImplementation(
      (args: {
        readonly profile: { readonly motivation?: string; readonly timeline?: string; readonly budget?: string };
        readonly projectId?: string;
        readonly form?: { readonly city?: string; readonly economicCapacity?: string };
      }) => ({
        ...(args.projectId ? { projectId: args.projectId } : {}),
        ...(args.form?.city ? { city: args.form.city } : {}),
        ...(args.form?.economicCapacity ? { economicCapacity: args.form.economicCapacity } : {}),
        ...(args.profile.timeline ? { timeToBuy: args.profile.timeline, purchaseTimeline: args.profile.timeline } : {}),
        ...(args.profile.motivation ? { motivation: args.profile.motivation } : {}),
        ...(args.profile.budget ? { budget: args.profile.budget } : {}),
      }),
    ),
  };
  const mockGuidedPath = {
    buildOutbound: jest.fn().mockReturnValue({
      financing: [],
      nextStep: [],
      cashAck: [],
      sentFinancing: false,
    }),
    shouldForceOfferCallSlots: jest.fn(
      (replyId: string | undefined, canOfferCall: boolean) =>
        replyId === 'next:call' && canOfferCall,
    ),
    shouldForceScheduleAfterCash: jest.fn(
      (input: {
        readonly paymentMethod?: string;
        readonly previousPaymentMethod?: string;
        readonly adoptedCaptureField?: string;
        readonly canOfferCall: boolean;
      }) =>
        input.canOfferCall &&
        input.paymentMethod === 'cash' &&
        input.previousPaymentMethod !== 'cash' &&
        input.adoptedCaptureField === 'paymentMethod',
    ),
    isNextQuestionTap: jest.fn((replyId: string | undefined) => replyId === 'next:question'),
  };
  const engine = new LeadAgentEngineService(
    { executeGetOrCreate: jest.fn().mockResolvedValue({ ...mockSettings, ...settings }) } as never,
    mockFaqResolver as never,
    mockAdResolver as never,
    mockTransitions as never,
    mockKnowledge as never,
    mockLlm as never,
    new LeadAgentPromptBuilder(),
    new LeadAgentScoringService(),
    new LeadAgentStageService(),
    mockCaptureSync as never,
    mockGuidedPath as never,
  );
  return {
    engine,
    mockLlm,
    mockKnowledge,
    mockTransitions,
    mockAdResolver,
    mockFaqResolver,
    mockCaptureSync,
    mockGuidedPath,
  };
};

describe('LeadAgentEngineService.executeTurn', () => {
  it('turns a normal LLM answer into spaced text plans, profile, signals and score', async () => {
    const inputTurn = buildTurn({
      replies: ['Qué bien, es una buena zona.', '¿Piensas pagar de contado o financiado?'],
      profile: { motivation: 'invest', paymentMethod: 'financed', lotPreference: '300 m2' },
      intents: ['asked_financing'],
      usedFaqIds: ['f1'],
      unansweredQuestion: '¿Hay descuento?',
    });
    const { engine } = buildEngine(inputTurn);
    const actualOutcome = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'invest', paymentMethod: 'financed' } })),
    );
    const { transition } = actualOutcome;
    expect(transition.outbound).toEqual([
      { kind: 'text', body: 'Qué bien, es una buena zona.' },
      { kind: 'text', body: '¿Piensas pagar de contado o financiado?', delayMs: LEAD_AGENT_REPLY_GAP_MS },
    ]);
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.expectsReply).toBe(true);
    expect(transition.answersPatch).toEqual({ formaPago: 'financed', rangoLote: '300 m2' });
    expect(transition.sessionPatch).toMatchObject({
      scoreSignals: ['motivation_known', 'payment_known', 'budget_known', 'high_intent_question'],
      score: 50,
      priority: 2,
      temperature: 'warm',
      leadProfile: { motivation: 'invest', paymentMethod: 'financed', stage: 'discovery', stageTurns: 0 },
    });
    expect(actualOutcome.usedFaqIds).toEqual(['f1']);
    expect(actualOutcome.unansweredQuestion).toBe('¿Hay descuento?');
  });

  it('falls back to a single motivation buttons message when the LLM fails with a project but no buyer motivation', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn(buildInput());
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalledWith(LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY);
    expect(transition.outbound).toHaveLength(1);
    expect(transition.outbound[0]).toMatchObject({
      kind: 'buttons',
      body: LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY,
      options: expect.arrayContaining([
        expect.objectContaining({ id: 'mot:build' }),
        expect.objectContaining({ id: 'mot:invest' }),
        expect.objectContaining({ id: 'mot:exploring' }),
      ]),
    });
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.sessionPatch?.leadProfile?.stage).not.toBe('booking');
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
  });

  it('parses Construir from pending text on LLM fail and asks payment with buttons', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn({
      ...buildInput(),
      pendingMessages: [{ text: 'Construir' }],
    });
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskPaymentCapture).toHaveBeenCalled();
    expect(transition.outbound[0]).toMatchObject({ kind: 'buttons', body: 'pago' });
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.sessionPatch?.leadProfile).toMatchObject({ motivation: 'build' });
    expect(transition.sessionPatch?.scoreSignals).toContain('motivation_known');
    expect(transition.sessionPatch?.leadProfile?.stage).not.toBe('booking');
  });

  it('skips a construir/contado FAQ when Construir captures buyer motivation and asks payment', async () => {
    const { engine, mockTransitions, mockFaqResolver } = buildEngine(null);
    mockFaqResolver.executeResolve.mockResolvedValue([
      {
        id: 'faq-construir-contado',
        question: 'Si pago de contado, ¿puedo construir de inmediato?',
        alternativePhrasings: ['licencia para construir'],
        answer:
          'No, aunque pagues de contado. El lote debe estar desenglobado y entregado con servicios públicos.',
        category: 'legal',
      },
    ]);
    const { transition, usedFaqIds } = await engine.executeTurn({
      ...buildInput(),
      pendingMessages: [{ text: 'Construir' }],
    });
    expect(usedFaqIds).toEqual([]);
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskPaymentCapture).toHaveBeenCalled();
    expect(transition.outbound[0]).toMatchObject({ kind: 'buttons', body: 'pago' });
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.sessionPatch?.leadProfile).toMatchObject({ motivation: 'build' });
  });

  it('answers a matching FAQ on LLM fail instead of offering the schedule', async () => {
    const { engine, mockTransitions, mockFaqResolver } = buildEngine(null);
    mockFaqResolver.executeResolve.mockResolvedValue([
      {
        id: 'faq-legal',
        question: '¿Cómo es la escrituración?',
        alternativePhrasings: ['Se entrega escricturado?'],
        answer: 'Se firma la escritura pública y recibes la matrícula a tu nombre.',
        category: 'legal',
      },
    ]);
    const { transition, usedFaqIds } = await engine.executeTurn({
      ...buildInput(buildSession({ leadProfile: { motivation: 'build', paymentMethod: 'cash' } })),
      pendingMessages: [{ text: '¿Lo entregan con escrituras?' }],
    });
    expect(transition.outbound).toEqual([
      { kind: 'text', body: 'Se firma la escritura pública y recibes la matrícula a tu nombre.' },
    ]);
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(usedFaqIds).toEqual(['faq-legal']);
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
  });

  it('continues in chat on LLM fail when no FAQ matches and the lead is buyer-qualified', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
    );
    expect(mockTransitions.buildAskPaymentCapture).toHaveBeenCalledWith(LEAD_TEMPLATES.askPaymentCapturePicker);
    expect(transition.outbound).toHaveLength(1);
    expect(transition.outbound[0]).toMatchObject({ kind: 'buttons', body: 'pago' });
    expect(mockTransitions.buildAskTimeToBuy).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
  });

  it('parses construi4 typo from pending text on LLM fail and stays in chat', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn({
      ...buildInput(),
      pendingMessages: [{ text: 'Construi4' }],
    });
    expect(transition.sessionPatch?.leadProfile?.motivation).toBe('build');
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
  });

  it('acknowledges exploring on LLM fail and appends short-body motivation buttons for re-qualify', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn({
      ...buildInput(),
      pendingMessages: [{ text: 'solo explorando' }],
    });
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: LEAD_AGENT_FALLBACK_EXPLORING_REPLY });
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalledWith('Para orientarte mejor, indícame el motivo de compra:');
    expect(transition.outbound[1]).toMatchObject({
      kind: 'buttons',
      body: 'Para orientarte mejor, indícame el motivo de compra:',
      delayMs: LEAD_AGENT_REPLY_GAP_MS,
      options: expect.arrayContaining([expect.objectContaining({ id: 'mot:build' })]),
    });
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.sessionPatch?.leadProfile?.motivation).toBe('exploring');
    expect(transition.sessionPatch?.scoreSignals ?? []).not.toContain('motivation_known');
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
  });

  it('falls back to a chat continuation when the LLM fails and the lead is buyer-qualified', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
    );
    expect(transition.outbound).toHaveLength(1);
    expect(transition.outbound[0]).toMatchObject({ kind: 'buttons', body: 'pago' });
    expect(mockTransitions.buildAskPaymentCapture).toHaveBeenCalled();
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.sessionPatch?.leadProfile?.stage).not.toBe('booking');
    expect(transition.expectsReply).toBe(true);
  });

  it('keeps the schedule fallback on LLM fail when already choosing a call slot', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ step: LeadConversationStep.AskSchedule, leadProfile: { motivation: 'build' } })),
    );
    expect(mockTransitions.buildAskSchedule).toHaveBeenCalled();
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: LEAD_AGENT_FALLBACK_REPLY });
    expect(transition.nextStep).toBe(LeadConversationStep.AskSchedule);
  });

  it('falls back to configured greeting plus the project picker when the LLM fails without a project', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn(buildInput(buildSession({ projectId: undefined, projectTitle: undefined })));
    expect(mockTransitions.buildProjectPicker).toHaveBeenCalled();
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: 'Hola Camila' });
    expect(transition.outbound[1]).toMatchObject({
      kind: 'list',
      body: '¡Con mucho gusto te comparto información! Tenemos diferentes proyectos y quisiera orientarte sobre el que más te interese. ¿Cuál te gustaría conocer?',
      delayMs: LEAD_AGENT_REPLY_GAP_MS,
      options: expect.arrayContaining([
        expect.objectContaining({ id: 'project:p1' }),
        expect.objectContaining({ id: 'project:all' }),
      ]),
    });
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.sessionPatch?.leadProfile?.stage).toBe('opening');
    expect(transition.expectsReply).toBe(true);
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
  });

  it('appends the project picker when the lead has no confirmed project', async () => {
    const { engine, mockTransitions } = buildEngine(buildTurn({ replies: ['Hola, ¿qué proyecto te interesa?'] }));
    const { transition } = await engine.executeTurn(buildInput(buildSession({ projectId: undefined, projectTitle: undefined })));
    expect(mockTransitions.buildProjectPicker).toHaveBeenCalled();
    expect(transition.outbound).toHaveLength(2);
    expect(transition.outbound[1]).toMatchObject({
      kind: 'list',
      options: expect.arrayContaining([
        expect.objectContaining({ id: 'project:p1' }),
        expect.objectContaining({ id: 'project:all' }),
      ]),
    });
  });

  it('adopts project:p1 from a tap, sends shortDescription teaser then motivation buttons', async () => {
    const { engine, mockTransitions } = buildEngine(buildTurn({ replies: ['Perfecto, Valle del Sol.'] }));
    const { transition } = await engine.executeTurn({
      ...buildInput(buildSession({ projectId: undefined, projectTitle: undefined })),
      pendingMessages: [{ text: '🏡 Valle del Sol', replyId: 'project:p1' }],
    });
    expect(transition.sessionPatch).toMatchObject({
      projectId: 'p1',
      projectTitle: 'Valle del Sol',
      isAllProjects: false,
    });
    expect(mockTransitions.buildProjectPicker).not.toHaveBeenCalled();
    expect(mockTransitions.buildProjectTeaser).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Valle del Sol',
        shortDescription: 'Lotes campestres en Carmen de Apicalá con construcción libre.',
      }),
    );
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalledWith(LEAD_TEMPLATES.askMotivationChoice);
    expect(transition.outbound).toHaveLength(2);
    expect(transition.outbound[0]).toMatchObject({
      kind: 'text',
      body: expect.stringContaining('Lotes campestres en Carmen de Apicalá'),
    });
    expect(transition.outbound[1]).toMatchObject({
      kind: 'buttons',
      body: LEAD_TEMPLATES.askMotivationChoice,
      delayMs: LEAD_AGENT_REPLY_GAP_MS,
      options: expect.arrayContaining([expect.objectContaining({ id: 'mot:build' })]),
    });
    expect(transition.sessionPatch?.leadProfile?.stage).not.toBe('opening');
  });

  it('adopts project:all from a tap and clears needsProject for stage without appending the picker', async () => {
    const { engine, mockTransitions, mockLlm } = buildEngine(buildTurn({ replies: ['Genial, te ayudo con todos.'] }));
    const { transition } = await engine.executeTurn({
      ...buildInput(buildSession({ projectId: undefined, projectTitle: undefined })),
      pendingMessages: [{ text: '✨ Me interesan todos', replyId: 'project:all' }],
    });
    expect(transition.sessionPatch).toMatchObject({ isAllProjects: true });
    expect(transition.sessionPatch).not.toHaveProperty('projectId');
    expect(mockTransitions.buildProjectPicker).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalled();
    const context = JSON.parse(mockLlm.executeTurn.mock.calls[0][0][1].content as string) as {
      needsProject: boolean;
    };
    expect(context.needsProject).toBe(false);
    expect(transition.sessionPatch?.leadProfile?.stage).not.toBe('opening');
  });

  it('appends the picker on offer_projects even with a confirmed project', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({
        action: 'offer_projects',
        replies: ['Claro, ¿cuál otro te interesa?'],
        profile: { motivation: 'build' },
      }),
    );
    const { transition } = await engine.executeTurn(buildInput(buildSession({ leadProfile: { motivation: 'build' } })));
    expect(mockTransitions.buildProjectPicker).toHaveBeenCalled();
    expect(transition.outbound[1]).toMatchObject({
      kind: 'list',
      options: expect.arrayContaining([expect.objectContaining({ id: 'project:p1' })]),
    });
  });

  it('sends only the motivation buttons when the project was already on the session', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({ replies: ['¿Qué te motiva a buscar lote: construir, invertir o descansar?'] }),
    );
    const { transition } = await engine.executeTurn(buildInput());
    expect(mockTransitions.buildProjectTeaser).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalledWith(LEAD_TEMPLATES.askMotivationPicker);
    expect(transition.outbound).toHaveLength(1);
    expect(transition.outbound[0]).toMatchObject({
      kind: 'buttons',
      body: LEAD_TEMPLATES.askMotivationPicker,
      options: expect.arrayContaining([
        expect.objectContaining({ id: 'mot:build' }),
        expect.objectContaining({ id: 'mot:invest' }),
        expect.objectContaining({ id: 'mot:exploring' }),
      ]),
    });
  });

  it('adopts mot:build from a tap and sends only Financiado / De contado buttons', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({
        replies: ['Excelente, ¿cómo te gustaría manejarlo, con financiación o de contado?'],
      }),
    );
    const { transition } = await engine.executeTurn({
      ...buildInput(),
      pendingMessages: [{ text: '🏗️ Construir', replyId: 'mot:build' }],
    });
    expect(transition.sessionPatch?.leadProfile?.motivation).toBe('build');
    expect(transition.sessionPatch?.scoreSignals).toContain('motivation_known');
    expect(mockTransitions.buildAskMotivation).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskPaymentCapture).toHaveBeenCalledWith(LEAD_TEMPLATES.askPaymentCapturePicker);
    expect(transition.outbound).toHaveLength(1);
    expect(transition.outbound[0]).toMatchObject({ kind: 'buttons', body: 'pago' });
  });

  it('sends only motivation buttons when exploring is already on the session', async () => {
    const { engine, mockTransitions } = buildEngine(buildTurn({ replies: ['Sin problema, cuando quieras.'] }));
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'exploring' } })),
    );
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalledWith(LEAD_TEMPLATES.askMotivationPicker);
    expect(transition.outbound).toHaveLength(1);
    expect(transition.outbound[0]).toMatchObject({
      kind: 'buttons',
      body: LEAD_TEMPLATES.askMotivationPicker,
      options: expect.arrayContaining([expect.objectContaining({ id: 'mot:build' })]),
    });
  });

  it('ignores LLM-invented motivation and sends teaser + motive buttons after a project tap', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({
        replies: ['Perfecto, Parque del Agua es un buen proyecto. Veo que te interesa como inversión.'],
        profile: { motivation: 'invest' },
        projectId: 'p1',
      }),
    );
    const { transition } = await engine.executeTurn({
      ...buildInput(buildSession({ projectId: undefined, projectTitle: undefined, leadProfile: {} })),
      pendingMessages: [{ text: '🌿 Parque del Agua', replyId: 'project:p1' }],
    });
    expect(transition.sessionPatch?.leadProfile?.motivation).toBeUndefined();
    expect(transition.sessionPatch?.scoreSignals ?? []).not.toContain('motivation_known');
    expect(mockTransitions.buildProjectTeaser).toHaveBeenCalled();
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalledWith(LEAD_TEMPLATES.askMotivationChoice);
    expect(transition.outbound[0]?.kind).toBe('text');
    expect(transition.outbound.some((plan) => plan.kind === 'buttons')).toBe(true);
  });

  it('does not append motivation buttons after a mot:build tap even if LLM profile is empty', async () => {
    const { engine, mockTransitions } = buildEngine(buildTurn({ replies: ['Listo.'], profile: {} }));
    const { transition } = await engine.executeTurn({
      ...buildInput(buildSession({ leadProfile: { motivation: 'exploring' } })),
      pendingMessages: [{ text: '🏗️ Construir', replyId: 'mot:build' }],
    });
    expect(transition.sessionPatch?.leadProfile?.motivation).toBe('build');
    expect(mockTransitions.buildAskMotivation).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskPaymentCapture).toHaveBeenCalled();
    expect(transition.outbound[0]).toMatchObject({ kind: 'buttons' });
  });

  it('coerces offer_call_slots to continue when the lead has no project', async () => {
    const { engine, mockTransitions } = buildEngine(buildTurn({ action: 'offer_call_slots' }));
    const { transition } = await engine.executeTurn(buildInput(buildSession({ projectId: undefined, projectTitle: undefined })));
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.sessionPatch?.leadProfile?.stage).toBe('opening');
    expect(transition.sessionPatch?.scoreSignals ?? []).not.toContain('accepted_call');
  });

  it('coerces offer_call_slots to continue when the lead has a project but no buyer motivation', async () => {
    const { engine, mockTransitions } = buildEngine(buildTurn({ action: 'offer_call_slots' }));
    const { transition } = await engine.executeTurn(buildInput());
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.sessionPatch?.scoreSignals ?? []).not.toContain('accepted_call');
    expect(transition.sessionPatch?.leadProfile?.stage).not.toBe('booking');
  });

  it('sends each requested medium the project has once and records it', async () => {
    const inputTurn = buildTurn({
      action: 'send_media',
      media: ['video', 'plan', 'brochure'],
      profile: { motivation: 'build' },
    });
    const { engine } = buildEngine(inputTurn);
    const first = await engine.executeTurn(buildInput(buildSession({ leadProfile: { motivation: 'build' } })));
    expect(first.transition.outbound.slice(1).map((plan) => plan.kind)).toEqual(['video', 'document', 'document']);
    expect(first.transition.outbound[2]).toMatchObject({ mediaUrl: 'https://rag.test/plane.pdf', fileName: 'Plano Valle del Sol.pdf' });
    const sentMedia = first.transition.sessionPatch?.leadProfile?.sentMedia;
    expect(sentMedia).toEqual(['video', 'plan', 'brochure']);
    const second = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'build', sentMedia } })),
    );
    expect(second.transition.outbound).toHaveLength(1);
    expect(second.transition.sessionPatch?.leadProfile?.sentMedia).toEqual(['video', 'plan', 'brochure']);
  });

  it('sends the plan as an image when it is not a PDF and skips media the project lacks', async () => {
    const { engine, mockKnowledge } = buildEngine(
      buildTurn({ action: 'send_media', media: ['plan', 'video'], profile: { motivation: 'invest' } }),
    );
    mockKnowledge.executeGetById.mockResolvedValue({ ...mockProject, planeUrl: 'https://rag.test/plane.png', videoUrl: undefined });
    const { transition } = await engine.executeTurn(buildInput(buildSession({ leadProfile: { motivation: 'invest' } })));
    expect(transition.outbound.slice(1)).toEqual([
      expect.objectContaining({ kind: 'image', mediaUrl: 'https://rag.test/plane.png' }),
    ]);
    expect(transition.sessionPatch?.leadProfile?.sentMedia).toEqual(['plan']);
  });

  it('offers the schedule buttons and accepts the call when there is no period', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({ action: 'offer_call_slots', profile: { motivation: 'build' } }),
    );
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
    );
    expect(mockTransitions.buildAskSchedule).toHaveBeenCalled();
    expect(mockTransitions.buildAskCallSlot).not.toHaveBeenCalled();
    expect(transition.nextStep).toBe(LeadConversationStep.AskSchedule);
    expect(transition.outbound[1]).toMatchObject({ kind: 'buttons', delayMs: LEAD_AGENT_REPLY_GAP_MS });
    expect(transition.sessionPatch?.scoreSignals).toContain('accepted_call');
    expect(transition.sessionPatch?.leadProfile?.stage).toBe('booking');
  });

  it('coerces offer_call_slots to continue when the turn answers a FAQ without wants_call', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({
        replies: ['Sí, se firma la escritura pública a tu nombre.'],
        action: 'offer_call_slots',
        profile: { motivation: 'build' },
        usedFaqIds: ['faq-legal'],
      }),
    );
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'build', paymentMethod: 'cash' } })),
    );
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
    expect(transition.outbound).toEqual([{ kind: 'text', body: 'Sí, se firma la escritura pública a tu nombre.' }]);
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.sessionPatch?.scoreSignals ?? []).not.toContain('accepted_call');
    expect(transition.sessionPatch?.leadProfile?.stage).not.toBe('booking');
  });

  it('keeps offer_call_slots when a FAQ turn also has wants_call', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({
        replies: ['Te cuento eso en la llamada.'],
        action: 'offer_call_slots',
        profile: { motivation: 'build' },
        intents: ['wants_call'],
        usedFaqIds: ['faq-legal'],
      }),
    );
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
    );
    expect(mockTransitions.buildAskSchedule).toHaveBeenCalled();
    expect(transition.nextStep).toBe(LeadConversationStep.AskSchedule);
    expect(transition.sessionPatch?.scoreSignals).toContain('accepted_call');
  });

  it('offers the call slot list of the period and takes its answers patch', async () => {
    const customerId = new Types.ObjectId();
    const inputTurn = buildTurn({
      action: 'offer_call_slots',
      callPeriod: 'morning',
      profile: { motivation: 'invest' },
    });
    const { engine, mockTransitions } = buildEngine(inputTurn);
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ customerId, leadProfile: { motivation: 'invest' } })),
    );
    expect(mockTransitions.buildAskCallSlot).toHaveBeenCalledWith('morning', false, customerId);
    expect(transition.nextStep).toBe(LeadConversationStep.AskCallSlot);
    expect(transition.answersPatch).toEqual({ horarioLlamada: 'morning' });
    expect(transition.outbound[1]).toMatchObject({ kind: 'list' });
    expect(transition.sessionPatch?.scoreSignals).toContain('accepted_call');
  });

  it('closes the conversation on opt-out with the farewell only', async () => {
    const inputTurn = buildTurn({ action: 'opt_out', replies: ['Claro', 'Adiós'], profile: { motivation: 'invest', timeline: 'immediate' } });
    const { engine } = buildEngine(inputTurn);
    const { transition } = await engine.executeTurn(buildInput());
    expect(transition.outbound).toEqual([{ kind: 'text', body: LEAD_AGENT_OPT_OUT_REPLY }]);
    expect(transition.nextStep).toBe(LeadConversationStep.Closed);
    expect(transition.status).toBe('disqualified');
    expect(transition.expectsReply).toBe(false);
    expect(transition.sessionPatch).toMatchObject({ temperature: 'cold', priority: 1 });
    expect(transition.sessionPatch?.optedOutAt).toBeInstanceOf(Date);
  });

  it('keeps waiting on the slot step and stays scheduled after booking', async () => {
    const { engine } = buildEngine(buildTurn());
    const waiting = await engine.executeTurn(buildInput(buildSession({ step: LeadConversationStep.AskCallSlot })));
    const booked = await engine.executeTurn(buildInput(buildSession({ step: LeadConversationStep.Scheduled, status: 'scheduled' })));
    expect(waiting.transition.nextStep).toBe(LeadConversationStep.AskCallSlot);
    expect(booked.transition.nextStep).toBe(LeadConversationStep.Scheduled);
    expect(booked.transition.sessionPatch?.leadProfile?.stage).toBe('booked');
  });

  it('reactivates an abandoned session', async () => {
    const { engine } = buildEngine(buildTurn());
    const { transition } = await engine.executeTurn(buildInput(buildSession({ status: 'abandoned' })));
    expect(transition.status).toBe('active');
  });

  it('never carries a scoreEvent, in any branch', async () => {
    const actions: LeadAgentLlmTurn['action'][] = ['continue', 'send_media', 'offer_call_slots', 'opt_out'];
    const turns = [null, ...actions.map((action) => buildTurn({ action, media: ['video'] }))];
    const outcomes = await Promise.all(turns.map((turn) => buildEngine(turn).engine.executeTurn(buildInput())));
    outcomes.forEach((outcome) => expect(outcome.transition).not.toHaveProperty('scoreEvent'));
  });

  it('drops a projectId the knowledge does not have', async () => {
    const { engine } = buildEngine(buildTurn({ projectId: 'ghost' }));
    const { transition } = await engine.executeTurn(buildInput(buildSession({ projectId: undefined, projectTitle: undefined })));
    expect(transition.sessionPatch).not.toHaveProperty('projectId');
  });

  it('adopts a valid projectId chosen by the LLM when the lead has no project', async () => {
    const { engine, mockLlm } = buildEngine(buildTurn({ projectId: 'p1' }));
    const { transition } = await engine.executeTurn(buildInput(buildSession({ projectId: undefined, projectTitle: undefined })));
    expect(transition.sessionPatch).toMatchObject({ projectId: 'p1', projectTitle: 'Valle del Sol' });
    const validation = mockLlm.executeTurn.mock.calls[0][1];
    expect([...validation.allowedProjectIds]).toEqual(['p1']);
    expect([...validation.allowedFaqIds]).toEqual(['f1']);
  });

  it('does not re-patch projectId when the LLM returns the same project already on the session', async () => {
    const { engine } = buildEngine(buildTurn({ projectId: 'p1' }));
    const { transition } = await engine.executeTurn(buildInput());
    expect(transition.sessionPatch).not.toHaveProperty('projectId');
  });

  it('soft-suggests the ad project without persisting it or appending the picker', async () => {
    const customerId = new Types.ObjectId();
    const { engine, mockAdResolver, mockLlm, mockTransitions } = buildEngine(buildTurn());
    mockAdResolver.executeResolveForCustomer.mockResolvedValue({ id: 'p1', title: 'Valle del Sol' });
    const input = buildInput(buildSession({ projectId: undefined, projectTitle: undefined, customerId }));
    const { transition } = await engine.executeTurn(input);
    expect(mockAdResolver.executeResolveForCustomer).toHaveBeenCalledWith(customerId);
    expect(transition.sessionPatch).not.toHaveProperty('projectId');
    expect(mockTransitions.buildProjectPicker).not.toHaveBeenCalled();
    expect(transition.outbound.every((plan) => plan.kind === 'text')).toBe(true);
    const contextJson = mockLlm.executeTurn.mock.calls[0][0][1].content as string;
    const context = JSON.parse(contextJson) as {
      needsProject: boolean;
      suggestedProject?: { id: string; title: string };
    };
    expect(context.needsProject).toBe(true);
    expect(context.suggestedProject).toEqual({ id: 'p1', title: 'Valle del Sol' });
  });

  it('adopts the campaign project on Instant Form dump without location rejection', async () => {
    const customerId = new Types.ObjectId();
    const formBody = `¡Hola! He completado el formulario y me gustaría recibir más información sobre vuestro negocio.
Full name: Freddy Martínez
¿Cuánto tienes disponible para invertir?: Entre $15’000.000 COP y $35’000.000 COP
City: Bogotá
Phone number: +573219019806
¿Tienes conocimiento de que nuestro proyecto está ubicado en Carmen de Apicalá, Tolima?: Si, y me gustaria conocerla
Email: fdmg1097@gmail.com`;
    const { engine, mockAdResolver, mockTransitions, mockCaptureSync } = buildEngine(
      buildTurn({ replies: ['Hola Freddy, qué gusto saludarte.'] }),
    );
    mockAdResolver.executeResolveForCustomer.mockResolvedValue({ id: 'p1', title: 'Valle del Sol' });
    mockCaptureSync.executeGetCaptureKnown.mockResolvedValue({
      known: { city: 'Bogotá', economicCapacity: '20_30m', projectId: 'p1' },
      missingCaptureFields: ['buyMotive', 'timeToBuy'],
      nextCaptureField: 'buyMotive',
      values: { city: 'Bogotá', economicCapacity: '20_30m' },
    });
    const { transition, capturePatch } = await engine.executeTurn({
      session: buildSession({ projectId: undefined, projectTitle: undefined, customerId }),
      history: [],
      pendingMessages: [{ text: formBody, isInstantFormDump: true }],
    });
    expect(transition.sessionPatch).toMatchObject({ projectId: 'p1', projectTitle: 'Valle del Sol' });
    expect(mockTransitions.buildProjectPicker).not.toHaveBeenCalled();
    expect(capturePatch).toMatchObject({ city: 'Bogotá', economicCapacity: '20_30m', projectId: 'p1' });
  });

  it('keeps suggested project unconfirmed and skips picker when Instant Form rejects the location', async () => {
    const customerId = new Types.ObjectId();
    const formBody = `¡Hola! He completado el formulario.
Full name: Carolina
¿Cuánto tienes disponible para invertir?: Entre $15’000.000 COP y $35’000.000 COP
City: Bogotá
Phone number: +573214859261
¿Tienes conocimiento de que nuestro proyecto está ubicado en Carmen de Apicalá, Tolima?: No, busco un lote en otra ciudad
Email: carola@test.com`;
    const { engine, mockAdResolver, mockTransitions } = buildEngine(
      buildTurn({ replies: ['Veo que buscas en otra ciudad.'] }),
    );
    mockAdResolver.executeResolveForCustomer.mockResolvedValue({ id: 'p1', title: 'Valle del Sol' });
    const { transition } = await engine.executeTurn({
      session: buildSession({ projectId: undefined, projectTitle: undefined, customerId }),
      history: [],
      pendingMessages: [{ text: formBody, isInstantFormDump: true }],
    });
    expect(transition.sessionPatch).not.toHaveProperty('projectId');
    expect(mockTransitions.buildProjectPicker).not.toHaveBeenCalled();
  });

  it('sends only the payment buttons when metadata already has a payment and the chat has not chosen one', async () => {
    const { engine, mockTransitions, mockCaptureSync } = buildEngine(
      buildTurn({
        replies: [
          '¡Qué bueno! Construir a tu medida es una gran decisión.',
          'Para orientarte con el pago, ¿prefieres financiado o de contado?',
        ],
        usedFaqIds: ['faq-legal'],
        profile: { paymentMethod: 'financed' },
      }),
    );
    mockCaptureSync.executeGetCaptureKnown.mockResolvedValue({
      known: { paymentMethod: 'financing', buyMotive: 'build' },
      missingCaptureFields: [],
      nextCaptureField: undefined,
      values: { paymentMethod: 'financing' },
    });
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
    );
    expect(mockTransitions.buildAskPaymentCapture).toHaveBeenCalledWith(LEAD_TEMPLATES.askPaymentCapturePicker);
    expect(transition.outbound).toEqual([{ kind: 'buttons', body: 'pago', options: [] }]);
    expect(transition.sessionPatch?.leadProfile?.paymentMethod).toBeUndefined();
  });

  it('uses the predefined greeting without project and drops the AI Hola', async () => {
    const turn = buildTurn({
      replies: ['¡Hola! Qué gusto tenerte por aquí.'],
      profile: { motivation: 'invest' },
    });
    const session = buildSession({
      projectId: undefined,
      projectTitle: undefined,
      leadProfile: { motivation: 'invest', paymentMethod: 'cash' },
    });
    const { engine, mockTransitions } = buildEngine(turn);
    const first = await engine.executeTurn({
      session,
      history: [{ direction: 'outbound', body: 'Plantilla de bienvenida' }],
      pendingMessages: [{ text: 'Hola' }],
    });
    expect(first.transition.outbound[0]).toEqual({ kind: 'text', body: 'Hola Camila' });
    expect(first.transition.outbound.some((plan) => plan.body?.includes('Qué gusto tenerte'))).toBe(false);
    expect(first.transition.outbound.filter((plan) => plan.kind === 'text')).toHaveLength(1);
    expect(mockTransitions.buildProjectPicker).toHaveBeenCalled();
    const { engine: laterEngine } = buildEngine(
      buildTurn({ replies: ['Te cuento de Valle del Sol.'], profile: { motivation: 'invest' } }),
    );
    const later = await laterEngine.executeTurn({
      session: buildSession({ leadProfile: { motivation: 'invest', paymentMethod: 'cash' } }),
      history: [
        { direction: 'outbound', body: 'Hola Camila' },
        { direction: 'inbound', body: 'Hola' },
      ],
      pendingMessages: [{ text: 'Construir' }],
    });
    expect(later.transition.outbound[0]).toMatchObject({ kind: 'text', body: 'Te cuento de Valle del Sol.' });
  });

  it('folds soft-suggested project into the predefined greeting and drops AI Hola', async () => {
    const { engine, mockAdResolver, mockTransitions } = buildEngine(
      buildTurn({
        replies: ['Hola Devvoid, soy Verónica. Qué bueno tenerte por aquí.'],
      }),
    );
    mockAdResolver.executeResolveForCustomer.mockResolvedValue({
      id: 'p1',
      title: 'Parque del Agua',
    });
    const { transition } = await engine.executeTurn({
      session: buildSession({
        projectId: undefined,
        projectTitle: undefined,
        customerId: new Types.ObjectId(),
      }),
      history: [{ direction: 'outbound', body: 'Plantilla de bienvenida' }],
      pendingMessages: [{ text: 'Hola' }],
    });
    expect(transition.outbound[0]).toEqual({
      kind: 'text',
      body: 'Hola Camila\n\nVeo que te interesó Parque del Agua, ¿es así?',
    });
    expect(
      transition.outbound.filter((plan) => plan.kind === 'text' && plan.body?.toLowerCase().startsWith('hola')),
    ).toHaveLength(1);
    expect(transition.outbound.some((plan) => plan.body?.includes('Qué bueno tenerte'))).toBe(false);
    expect(mockTransitions.buildProjectPicker).not.toHaveBeenCalled();
  });

  it('lets the AI greet when the project is already confirmed on the first message', async () => {
    const { engine } = buildEngine(
      buildTurn({
        replies: ['Hola Camila, qué gusto saludarte. Seguimos con Valle del Sol, ¿te parece?'],
        profile: { motivation: 'build' },
      }),
    );
    const { transition } = await engine.executeTurn({
      session: buildSession({
        projectId: 'p1',
        projectTitle: 'Valle del Sol',
        leadProfile: { motivation: 'build', paymentMethod: 'cash' },
      }),
      history: [],
      pendingMessages: [{ text: 'Hola' }],
    });
    expect(transition.outbound[0]).toMatchObject({
      kind: 'text',
      body: 'Hola Camila, qué gusto saludarte. Seguimos con Valle del Sol, ¿te parece?',
    });
    expect(transition.outbound.filter((plan) => plan.kind === 'text')).toHaveLength(1);
  });

  it('keeps greeting + project teaser + motive when the first inbound names a project', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({
        projectId: 'p1',
        replies: ['¡Hola! Parque del Agua es genial, ¿construyes o inviertes?'],
      }),
    );
    const { transition } = await engine.executeTurn({
      session: buildSession({ projectId: undefined, projectTitle: undefined }),
      history: [],
      pendingMessages: [{ text: 'Hola estoy interesado en parque del agua' }],
    });
    expect(mockTransitions.buildProjectTeaser).toHaveBeenCalled();
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalled();
    expect(transition.outbound).toHaveLength(3);
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: 'Hola Camila' });
    expect(transition.outbound[1]).toMatchObject({
      kind: 'text',
      body: expect.stringContaining('Perfecto. 🌿 Valle del Sol'),
    });
    expect(transition.outbound[2]).toMatchObject({ kind: 'buttons' });
    expect(transition.outbound.some((plan) => plan.body?.includes('¿construyes o inviertes'))).toBe(false);
  });

  it('sends only the payment buttons when motivation is known and payment is missing', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({ replies: ['Excelente, ¿financiación o de contado?'] }),
    );
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
    );
    expect(mockTransitions.buildAskPaymentCapture).toHaveBeenCalledWith(LEAD_TEMPLATES.askPaymentCapturePicker);
    expect(mockTransitions.buildAskTimeToBuy).not.toHaveBeenCalled();
    expect(transition.outbound).toHaveLength(1);
    expect(transition.outbound[0]).toMatchObject({
      kind: 'buttons',
      body: 'pago',
    });
  });

  it('adopts pay:financed and sends only the monthly lot picker', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({
        replies: ['Excelente, la financiación te da mucha flexibilidad.'],
        intents: ['asked_financing'],
      }),
    );
    const outcome = await engine.executeTurn({
      ...buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
      pendingMessages: [{ text: 'Financiado', replyId: 'pay:financed' }],
    });
    expect(outcome.transition.sessionPatch?.leadProfile?.paymentMethod).toBe('financed');
    expect(outcome.capturePatch).toMatchObject({ paymentMethod: 'financing' });
    expect(mockTransitions.buildAskPaymentCapture).not.toHaveBeenCalled();
    expect(mockTransitions.buildFinancingLotPicker).toHaveBeenCalled();
    expect(outcome.transition.outbound).toHaveLength(1);
    expect(outcome.transition.outbound[0]).toMatchObject({
      kind: 'buttons',
      options: expect.arrayContaining([expect.objectContaining({ id: 'lot:300' })]),
    });
  });

  it('opens schedule on pay:financed when pricePolicy is defer_to_advisor', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({
        replies: ['Perfecto, te comparto las opciones de lotes con sus cuotas mensuales.'],
        intents: ['asked_financing'],
        profile: { paymentMethod: 'financed' },
      }),
      { pricePolicy: 'defer_to_advisor' },
    );
    const outcome = await engine.executeTurn({
      ...buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
      pendingMessages: [{ text: 'Financiado', replyId: 'pay:financed' }],
    });
    expect(mockTransitions.buildFinancingLotPicker).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskSchedule).toHaveBeenCalled();
    expect(outcome.transition.nextStep).toBe(LeadConversationStep.AskSchedule);
    expect(outcome.transition.outbound[0]).toMatchObject({
      kind: 'text',
      body: LEAD_TEMPLATES.scheduleLeadFinanced,
    });
  });

  it('sends the monthly lot picker when Financiado is written without a reply id', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({
        replies: ['Excelente, la financiación te da mucha flexibilidad.'],
        profile: { paymentMethod: 'financed' },
        intents: ['asked_financing'],
      }),
    );
    const outcome = await engine.executeTurn({
      ...buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
      pendingMessages: [{ text: '💰 Financiado' }],
    });
    expect(outcome.transition.sessionPatch?.leadProfile?.paymentMethod).toBe('financed');
    expect(mockTransitions.buildFinancingLotPicker).toHaveBeenCalled();
    expect(outcome.transition.outbound[0]).toMatchObject({
      kind: 'buttons',
      options: expect.arrayContaining([expect.objectContaining({ id: 'lot:300' })]),
    });
  });

  it('adopts lot:300, acks the choice and opens the schedule', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({ replies: ['¿Algo más?'] }),
    );
    const outcome = await engine.executeTurn({
      ...buildInput(
        buildSession({ leadProfile: { motivation: 'build', paymentMethod: 'financed' } }),
      ),
      pendingMessages: [{ text: '300 m²', replyId: 'lot:300' }],
    });
    expect(outcome.transition.sessionPatch?.leadProfile?.lotPreference).toBe('300 m2');
    expect(mockTransitions.buildLotChoiceAck).toHaveBeenCalledWith(300);
    expect(mockTransitions.buildAskSchedule).toHaveBeenCalled();
    expect(outcome.transition.nextStep).toBe(LeadConversationStep.AskSchedule);
    expect(outcome.transition.outbound[0]).toMatchObject({
      kind: 'text',
      body: 'Excelente elección el de 300 m².',
    });
    expect(outcome.transition.outbound[1]).toMatchObject({ kind: 'buttons' });
  });

  it('adopts pay:cash and opens the schedule without next-step buttons', async () => {
    const { engine, mockTransitions, mockGuidedPath } = buildEngine(
      buildTurn({ replies: ['Perfecto de contado.'] }),
    );
    const outcome = await engine.executeTurn({
      ...buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
      pendingMessages: [{ text: 'De contado', replyId: 'pay:cash' }],
    });
    expect(outcome.transition.sessionPatch?.leadProfile?.paymentMethod).toBe('cash');
    expect(mockGuidedPath.shouldForceScheduleAfterCash).toHaveBeenCalled();
    expect(mockTransitions.buildAskSchedule).toHaveBeenCalled();
    expect(outcome.transition.nextStep).toBe(LeadConversationStep.AskSchedule);
    expect(outcome.transition.outbound[0]).toMatchObject({
      kind: 'text',
      body: LEAD_TEMPLATES.scheduleLeadCash,
    });
    expect(mockTransitions.buildAskNextStep).not.toHaveBeenCalled();
  });

  it('forces offer_call_slots when the lead taps next:call and is qualified', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({ replies: ['Listo, te agendo.'], action: 'continue' }),
    );
    const { transition } = await engine.executeTurn({
      ...buildInput(buildSession({ leadProfile: { motivation: 'build', paymentMethod: 'financed' } })),
      pendingMessages: [{ text: 'Hablar con asesor', replyId: 'next:call' }],
    });
    expect(mockTransitions.buildAskSchedule).toHaveBeenCalled();
    expect(transition.nextStep).toBe(LeadConversationStep.AskSchedule);
    expect(transition.sessionPatch?.scoreSignals ?? []).toContain('accepted_call');
  });

  it('asks for the free-text question when next:question is tapped and the LLM fails', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn({
      ...buildInput(buildSession({ leadProfile: { motivation: 'build', paymentMethod: 'financed' } })),
      pendingMessages: [{ text: 'Tengo otra duda', replyId: 'next:question' }],
    });
    expect(transition.outbound).toEqual([{ kind: 'text', body: LEAD_TEMPLATES.askYourQuestion }]);
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
  });

  it('adopts time:immediate after booking into profile and capture patch', async () => {
    const { engine, mockTransitions } = buildEngine(
      buildTurn({ replies: ['Perfecto, vamos con plazo inmediato.'] }),
    );
    const outcome = await engine.executeTurn({
      ...buildInput(
        buildSession({
          step: LeadConversationStep.Scheduled,
          status: 'scheduled',
          leadProfile: { motivation: 'build', paymentMethod: 'financed', stage: 'booked' },
        }),
      ),
      pendingMessages: [{ text: 'Compra inmediata', replyId: 'time:immediate' }],
    });
    expect(outcome.transition.sessionPatch?.leadProfile?.timeline).toBe('immediate');
    expect(outcome.capturePatch).toMatchObject({ timeToBuy: 'immediate' });
    expect(mockTransitions.buildAskTimeToBuy).not.toHaveBeenCalled();
  });

  it('does not adopt the soft-suggested project when the LLM invents projectId on Hola', async () => {
    const customerId = new Types.ObjectId();
    const { engine, mockAdResolver, mockTransitions } = buildEngine(
      buildTurn({
        projectId: 'p1',
        replies: ['Perfecto. 🌿 Parque del Agua es un gran proyecto.'],
      }),
    );
    mockAdResolver.executeResolveForCustomer.mockResolvedValue({ id: 'p1', title: 'Parque del Agua' });
    const { transition } = await engine.executeTurn({
      session: buildSession({ projectId: undefined, projectTitle: undefined, customerId }),
      history: [{ direction: 'outbound', body: 'Plantilla' }],
      pendingMessages: [{ text: 'Hola' }],
    });
    expect(transition.sessionPatch).not.toHaveProperty('projectId');
    expect(mockTransitions.buildProjectTeaser).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskMotivation).not.toHaveBeenCalled();
  });

  it('persists projectId when the customer affirms the soft-suggested ad project', async () => {
    const customerId = new Types.ObjectId();
    const { engine, mockAdResolver } = buildEngine(buildTurn({ projectId: 'p1' }));
    mockAdResolver.executeResolveForCustomer.mockResolvedValue({ id: 'p1', title: 'Valle del Sol' });
    const { transition } = await engine.executeTurn({
      session: buildSession({ projectId: undefined, projectTitle: undefined, customerId }),
      history: [
        { direction: 'outbound', body: 'Hola Camila\n\nVeo que te interesó Valle del Sol, ¿es así?' },
        { direction: 'inbound', body: 'Hola' },
      ],
      pendingMessages: [{ text: 'Sí' }],
    });
    expect(transition.sessionPatch).toMatchObject({ projectId: 'p1', projectTitle: 'Valle del Sol' });
  });

  it('does not look up the ad project without a customer', async () => {
    const { engine, mockAdResolver, mockKnowledge } = buildEngine(buildTurn());
    await engine.executeTurn(buildInput(buildSession({ projectId: undefined, projectTitle: undefined })));
    expect(mockAdResolver.executeResolveForCustomer).not.toHaveBeenCalled();
    expect(mockKnowledge.executeGetCatalogSummary).toHaveBeenCalled();
  });
});
