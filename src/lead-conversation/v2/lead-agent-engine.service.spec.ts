import { Types } from 'mongoose';
import { LEAD_AGENT_REPLY_GAP_MS } from '../constants/lead-conversation.constants';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { StepTransition } from '../types/step-transition.type';
import {
  LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY,
  LEAD_AGENT_FALLBACK_ASK_PROJECT_REPLY,
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
  shortDescription: 'Lotes campestres',
  description: 'Descripción',
  location: 'Tolima',
  city: 'Carmen',
  state: 'Tolima',
  lotOptions: [],
  amenitiesGroups: [],
  planeUrl: 'https://rag.test/plane.pdf',
  videoUrl: 'https://rag.test/video.mp4',
  brochureUrl: 'https://rag.test/brochure.pdf',
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
  history: [],
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
      body: '¿Cuál proyecto te interesa?',
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

const buildEngine = (turn: LeadAgentLlmTurn | null) => {
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
  };
  const mockAdResolver = { executeResolveForCustomer: jest.fn().mockResolvedValue(undefined) };
  const mockFaqResolver = {
    executeResolve: jest.fn().mockResolvedValue([
      { id: 'f1', question: '¿Precio?', answer: 'Desde 85M', category: 'price', alternativePhrasings: [] },
    ]),
  };
  const engine = new LeadAgentEngineService(
    { executeGetOrCreate: jest.fn().mockResolvedValue(mockSettings) } as never,
    mockFaqResolver as never,
    mockAdResolver as never,
    mockTransitions as never,
    mockKnowledge as never,
    mockLlm as never,
    new LeadAgentPromptBuilder(),
    new LeadAgentScoringService(),
    new LeadAgentStageService(),
  );
  return { engine, mockLlm, mockKnowledge, mockTransitions, mockAdResolver, mockFaqResolver };
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
    const actualOutcome = await engine.executeTurn(buildInput());
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

  it('parses Construir from pending text on LLM fail and offers the schedule', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn({
      ...buildInput(),
      pendingMessages: [{ text: 'Construir' }],
    });
    expect(mockTransitions.buildAskSchedule).toHaveBeenCalled();
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: LEAD_AGENT_FALLBACK_REPLY });
    expect(transition.nextStep).toBe(LeadConversationStep.AskSchedule);
    expect(transition.sessionPatch?.leadProfile).toMatchObject({ motivation: 'build' });
    expect(transition.sessionPatch?.scoreSignals).toContain('motivation_known');
    expect(transition.sessionPatch?.leadProfile?.stage).toBe('booking');
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
      ...buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
      pendingMessages: [{ text: '¿Lo entregan con escrituras?' }],
    });
    expect(transition.outbound).toEqual([
      { kind: 'text', body: 'Se firma la escritura pública y recibes la matrícula a tu nombre.' },
    ]);
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(usedFaqIds).toEqual(['faq-legal']);
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
  });

  it('keeps the schedule fallback on LLM fail when no FAQ matches', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
    );
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: LEAD_AGENT_FALLBACK_REPLY });
    expect(mockTransitions.buildAskSchedule).toHaveBeenCalled();
  });

  it('parses construi4 typo from pending text on LLM fail', async () => {
    const { engine } = buildEngine(null);
    const { transition } = await engine.executeTurn({
      ...buildInput(),
      pendingMessages: [{ text: 'Construi4' }],
    });
    expect(transition.sessionPatch?.leadProfile?.motivation).toBe('build');
    expect(transition.nextStep).toBe(LeadConversationStep.AskSchedule);
  });

  it('acknowledges exploring on LLM fail and appends short-body motivation buttons for re-qualify', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn({
      ...buildInput(),
      pendingMessages: [{ text: 'solo explorando' }],
    });
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: LEAD_AGENT_FALLBACK_EXPLORING_REPLY });
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalledWith('Elige una opción');
    expect(transition.outbound[1]).toMatchObject({
      kind: 'buttons',
      body: 'Elige una opción',
      delayMs: LEAD_AGENT_REPLY_GAP_MS,
      options: expect.arrayContaining([expect.objectContaining({ id: 'mot:build' })]),
    });
    expect(transition.nextStep).toBe(LeadConversationStep.V2Conversation);
    expect(transition.sessionPatch?.leadProfile?.motivation).toBe('exploring');
    expect(transition.sessionPatch?.scoreSignals ?? []).not.toContain('motivation_known');
    expect(mockTransitions.buildAskSchedule).not.toHaveBeenCalled();
  });

  it('falls back to the advisor call offer when the LLM fails and the lead is buyer-qualified', async () => {
    const { engine } = buildEngine(null);
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
    );
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: LEAD_AGENT_FALLBACK_REPLY });
    expect(transition.outbound[1]).toMatchObject({ kind: 'buttons', body: '¿Cuándo te llamamos?' });
    expect(transition.nextStep).toBe(LeadConversationStep.AskSchedule);
    expect(transition.sessionPatch?.leadProfile?.stage).toBe('booking');
    expect(transition.expectsReply).toBe(true);
  });

  it('falls back to asking for the project with the interactive picker when the LLM fails without a project', async () => {
    const { engine, mockTransitions } = buildEngine(null);
    const { transition } = await engine.executeTurn(buildInput(buildSession({ projectId: undefined, projectTitle: undefined })));
    expect(mockTransitions.buildProjectPicker).toHaveBeenCalled();
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: LEAD_AGENT_FALLBACK_ASK_PROJECT_REPLY });
    expect(transition.outbound[1]).toMatchObject({
      kind: 'list',
      body: '¿Cuál proyecto te interesa?',
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

  it('adopts project:p1 from a tap, stamps the session, skips project picker, and asks motivation with buttons', async () => {
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
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalledWith('Elige una opción');
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: 'Perfecto, Valle del Sol.' });
    expect(transition.outbound[1]).toMatchObject({
      kind: 'buttons',
      body: 'Elige una opción',
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

  it('appends short-body motivation buttons after LLM text when the lead has a project but no motivation', async () => {
    const { engine, mockTransitions } = buildEngine(buildTurn({ replies: ['Para orientarte mejor:'] }));
    const { transition } = await engine.executeTurn(buildInput());
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalledWith('Elige una opción');
    expect(transition.outbound[0]).toEqual({ kind: 'text', body: 'Para orientarte mejor:' });
    expect(transition.outbound[1]).toMatchObject({
      kind: 'buttons',
      body: 'Elige una opción',
      options: expect.arrayContaining([
        expect.objectContaining({ id: 'mot:build' }),
        expect.objectContaining({ id: 'mot:invest' }),
        expect.objectContaining({ id: 'mot:exploring' }),
      ]),
    });
  });

  it('adopts mot:build from a tap, stamps motivation, and does not append buttons', async () => {
    const { engine, mockTransitions } = buildEngine(buildTurn({ replies: ['Perfecto, para construir.'] }));
    const { transition } = await engine.executeTurn({
      ...buildInput(),
      pendingMessages: [{ text: '🏗️ Construir', replyId: 'mot:build' }],
    });
    expect(transition.sessionPatch?.leadProfile?.motivation).toBe('build');
    expect(transition.sessionPatch?.scoreSignals).toContain('motivation_known');
    expect(mockTransitions.buildAskMotivation).not.toHaveBeenCalled();
    expect(transition.outbound).toEqual([{ kind: 'text', body: 'Perfecto, para construir.' }]);
  });

  it('still appends short-body motivation buttons when exploring is already on the session', async () => {
    const { engine, mockTransitions } = buildEngine(buildTurn({ replies: ['Sin problema, cuando quieras.'] }));
    const { transition } = await engine.executeTurn(
      buildInput(buildSession({ leadProfile: { motivation: 'exploring' } })),
    );
    expect(mockTransitions.buildAskMotivation).toHaveBeenCalledWith('Elige una opción');
    expect(transition.outbound[1]).toMatchObject({
      kind: 'buttons',
      body: 'Elige una opción',
      options: expect.arrayContaining([expect.objectContaining({ id: 'mot:build' })]),
    });
  });

  it('does not append motivation buttons after a mot:build tap even if LLM profile is empty', async () => {
    const { engine, mockTransitions } = buildEngine(buildTurn({ replies: ['Listo.'], profile: {} }));
    const { transition } = await engine.executeTurn({
      ...buildInput(buildSession({ leadProfile: { motivation: 'exploring' } })),
      pendingMessages: [{ text: '🏗️ Construir', replyId: 'mot:build' }],
    });
    expect(transition.sessionPatch?.leadProfile?.motivation).toBe('build');
    expect(mockTransitions.buildAskMotivation).not.toHaveBeenCalled();
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
      buildInput(buildSession({ leadProfile: { motivation: 'build' } })),
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
    const inputTurn = buildTurn({ action: 'opt_out', replies: ['Claro', 'Adiós'], profile: { motivation: 'invest', timeline: 'within_3_months' } });
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

  it('soft-suggests the ad project without persisting it until the LLM confirms', async () => {
    const customerId = new Types.ObjectId();
    const { engine, mockAdResolver, mockLlm } = buildEngine(buildTurn());
    mockAdResolver.executeResolveForCustomer.mockResolvedValue({ id: 'p1', title: 'Valle del Sol' });
    const input = buildInput(buildSession({ projectId: undefined, projectTitle: undefined, customerId }));
    const { transition } = await engine.executeTurn(input);
    expect(mockAdResolver.executeResolveForCustomer).toHaveBeenCalledWith(customerId);
    expect(transition.sessionPatch).not.toHaveProperty('projectId');
    const contextJson = mockLlm.executeTurn.mock.calls[0][0][1].content as string;
    const context = JSON.parse(contextJson) as {
      needsProject: boolean;
      suggestedProject?: { id: string; title: string };
    };
    expect(context.needsProject).toBe(true);
    expect(context.suggestedProject).toEqual({ id: 'p1', title: 'Valle del Sol' });
  });

  it('persists projectId when the LLM confirms the soft-suggested ad project', async () => {
    const customerId = new Types.ObjectId();
    const { engine, mockAdResolver } = buildEngine(buildTurn({ projectId: 'p1' }));
    mockAdResolver.executeResolveForCustomer.mockResolvedValue({ id: 'p1', title: 'Valle del Sol' });
    const input = buildInput(buildSession({ projectId: undefined, projectTitle: undefined, customerId }));
    const { transition } = await engine.executeTurn(input);
    expect(transition.sessionPatch).toMatchObject({ projectId: 'p1', projectTitle: 'Valle del Sol' });
  });

  it('does not look up the ad project without a customer', async () => {
    const { engine, mockAdResolver, mockKnowledge } = buildEngine(buildTurn());
    await engine.executeTurn(buildInput(buildSession({ projectId: undefined, projectTitle: undefined })));
    expect(mockAdResolver.executeResolveForCustomer).not.toHaveBeenCalled();
    expect(mockKnowledge.executeGetCatalogSummary).toHaveBeenCalled();
  });
});
