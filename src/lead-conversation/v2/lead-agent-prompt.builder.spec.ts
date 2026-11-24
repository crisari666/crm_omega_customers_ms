import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import { LeadAgentPromptBuilder } from './lead-agent-prompt.builder';
import type { LeadAgentPromptInput } from './types/lead-agent-prompt-input.type';
import type { ProjectKnowledge } from './types/project-knowledge.type';

const mockProject: ProjectKnowledge = {
  id: 'p1',
  title: 'Valle del Sol',
  shortDescription: 'Lotes campestres',
  description: 'Proyecto con vista a la montaña',
  location: 'Carmen de Apicalá',
  city: 'Carmen de Apicalá',
  state: 'Tolima',
  priceSell: 85000000,
  lotOptions: [{ area: 300, price: 85000000 }],
  amenitiesGroups: [{ title: 'Servicios', items: ['Agua', 'Luz'] }],
  lotCounts: { available: 12, sold: 38, total: 50 },
  planeUrl: 'https://rag.test/plane.pdf',
  videoUrl: 'https://rag.test/video.mp4',
};

const buildInput = (overrides: Partial<LeadAgentPromptInput> = {}): LeadAgentPromptInput => ({
  assistantName: 'Verónica',
  businessName: 'La Ceiba',
  greeting: 'Hola {{customerName}}, soy {{assistantName}}, asistente virtual comercial de {{businessName}}.',
  pricePolicy: 'entry_ticket_first',
  session: {
    firstName: 'Camila',
    step: LeadConversationStep.V2Conversation,
    status: 'active',
    leadProfile: { stage: 'discovery', motivation: 'invest' },
    scoreSignals: [],
    answers: {},
    pendingOptions: [],
  },
  history: [],
  pendingMessages: [{ text: 'Hola' }],
  catalog: [],
  faqs: [],
  ...overrides,
});

const parseContext = (content: string): Record<string, unknown> => JSON.parse(content) as Record<string, unknown>;

describe('LeadAgentPromptBuilder', () => {
  const builder = new LeadAgentPromptBuilder();

  it('documents offer_projects and motivation WhatsApp buttons in the system prompt', () => {
    const systemPrompt = builder.buildMessages(buildInput())[0].content;
    expect(systemPrompt).toContain('offer_projects');
    expect(systemPrompt).toContain('selector de WhatsApp');
    expect(systemPrompt).toContain('needsMotivation');
    expect(systemPrompt).toContain('ÚNICAMENTE los botones de motivación');
    expect(systemPrompt).toContain('botones de WhatsApp');
  });

  it('orders system prompt, context, history and the pending messages joined by newlines', () => {
    const inputHistory = [
      { direction: 'outbound', body: 'Hola Camila' },
      { direction: 'inbound', body: 'Hola' },
    ] as const;
    const actualMessages = builder.buildMessages(
      buildInput({ history: inputHistory, pendingMessages: [{ text: 'Primera' }, { text: 'Segunda' }] }),
    );
    expect(actualMessages.map((message) => message.role)).toEqual(['system', 'system', 'assistant', 'user', 'user']);
    expect(actualMessages[0].content).toContain('Eres Verónica, asistente virtual comercial de La Ceiba');
    expect(actualMessages[4].content).toBe('Primera\nSegunda');
  });

  it('puts the stage, goal, profile, price policy and flags in the context', () => {
    const actualMessages = builder.buildMessages(buildInput({ pendingMessages: [{ text: 'x', isInstantFormDump: true }] }));
    const actualContext = parseContext(actualMessages[1].content);
    expect(actualContext).toMatchObject({
      stage: 'discovery',
      needsProject: true,
      needsMotivation: false,
      canOfferCall: false,
      profile: { motivation: 'invest' },
      pricePolicy: 'entry_ticket_first',
      greeting: 'Hola Camila, soy Verónica, asistente virtual comercial de La Ceiba.',
      isWaitingForSlotChoice: false,
      isAfterBooking: false,
      isFirstMessageFormDump: true,
    });
    expect(actualContext.stageGoal).toEqual(expect.stringContaining('paymentMethod'));
  });

  it('sets needsProject false and the confirm-opening goal when a project is known', () => {
    const actualContext = parseContext(
      builder.buildMessages(
        buildInput({
          project: mockProject,
          session: {
            ...buildInput().session,
            projectId: 'p1',
            projectTitle: 'Valle del Sol',
            leadProfile: { stage: 'opening' },
          },
        }),
      )[1].content,
    );
    expect(actualContext.needsProject).toBe(false);
    expect(actualContext.needsMotivation).toBe(true);
    expect(actualContext.canOfferCall).toBe(false);
    expect(actualContext.stageGoal).toEqual(expect.stringContaining('confirma'));
  });

  it('sets canOfferCall true when project and buyer motivation are known', () => {
    const actualContext = parseContext(
      builder.buildMessages(
        buildInput({
          project: mockProject,
          session: {
            ...buildInput().session,
            projectId: 'p1',
            leadProfile: { stage: 'bridge', motivation: 'build' },
          },
        }),
      )[1].content,
    );
    expect(actualContext).toMatchObject({
      needsProject: false,
      needsMotivation: false,
      canOfferCall: true,
    });
  });

  it('sets needsProject true and the ask-project opening goal without a project', () => {
    const actualContext = parseContext(
      builder.buildMessages(
        buildInput({
          session: { ...buildInput().session, leadProfile: { stage: 'opening' } },
          catalog: [{ id: 'p1', title: 'Valle del Sol', location: 'Tolima' }],
        }),
      )[1].content,
    );
    expect(actualContext.needsProject).toBe(true);
    expect(actualContext.stageGoal).toEqual(expect.stringContaining('selector de WhatsApp'));
  });

  it('sets needsProject false when isAllProjects is true without a projectId', () => {
    const actualContext = parseContext(
      builder.buildMessages(
        buildInput({
          session: { ...buildInput().session, isAllProjects: true, leadProfile: { stage: 'discovery' } },
        }),
      )[1].content,
    );
    expect(actualContext.needsProject).toBe(false);
  });

  it('keeps needsProject true and soft-hints suggestedProject from an ad', () => {
    const actualContext = parseContext(
      builder.buildMessages(
        buildInput({
          session: { ...buildInput().session, leadProfile: { stage: 'opening' } },
          suggestedProject: { id: 'p1', title: 'Parque del Agua' },
          catalog: [{ id: 'p1', title: 'Parque del Agua', location: 'Tolima' }],
        }),
      )[1].content,
    );
    expect(actualContext.needsProject).toBe(true);
    expect(actualContext.suggestedProject).toEqual({ id: 'p1', title: 'Parque del Agua' });
    expect(actualContext.stageGoal).toEqual(expect.stringContaining('suggestedProject'));
    expect(actualContext).not.toHaveProperty('project');
  });

  it('flags a slot choice in progress and a booked lead', () => {
    const base = buildInput().session;
    const waiting = parseContext(
      builder.buildMessages(buildInput({ session: { ...base, step: LeadConversationStep.AskCallSlot } }))[1].content,
    );
    const booked = parseContext(
      builder.buildMessages(buildInput({ session: { ...base, step: LeadConversationStep.Scheduled, status: 'scheduled' } }))[1]
        .content,
    );
    expect(waiting.isWaitingForSlotChoice).toBe(true);
    expect(booked.isAfterBooking).toBe(true);
  });

  it('never puts commission, ventor or holder data in the prompt', () => {
    const leakyProject = {
      ...mockProject,
      commissionPercentage: 7,
      commissionValue: 5950000,
      ventorName: 'Pedro Gómez',
      heldByUserId: 'user-1',
    } as ProjectKnowledge;
    const actualMessages = builder.buildMessages(buildInput({ project: leakyProject }));
    const actualContent = actualMessages.map((message) => message.content).join('\n');
    expect(actualContent).not.toMatch(/commission|ventorName|heldByUserId|Pedro Gómez/);
    expect(actualContent).toContain('Valle del Sol');
  });

  it('describes available media without exposing urls', () => {
    const actualContext = parseContext(builder.buildMessages(buildInput({ project: mockProject }))[1].content);
    expect(actualContext.project).toMatchObject({ availableMedia: { video: true, plan: true, brochure: false } });
    expect(JSON.stringify(actualContext)).not.toContain('rag.test');
  });

  it('includes the FAQ answer resolved for the project with alternative phrasings', () => {
    const inputFaqs = [
      {
        id: 'f1',
        question: '¿Cuánto cuesta?',
        answer: 'Desde $85.000.000 en Valle del Sol',
        category: 'price',
        alternativePhrasings: ['precio del lote', 'valor'],
      },
    ] as const;
    const actualContext = parseContext(builder.buildMessages(buildInput({ project: mockProject, faqs: inputFaqs }))[1].content);
    expect(actualContext.faqs).toEqual([
      {
        id: 'f1',
        question: '¿Cuánto cuesta?',
        answer: 'Desde $85.000.000 en Valle del Sol',
        alternativePhrasings: ['precio del lote', 'valor'],
      },
    ]);
  });

  it('carries the catalog when the lead has no project', () => {
    const inputCatalog = [{ id: 'p1', title: 'Valle del Sol', location: 'Tolima', priceFrom: 85000000 }];
    const actualContext = parseContext(builder.buildMessages(buildInput({ catalog: inputCatalog }))[1].content);
    expect(actualContext.catalog).toEqual(inputCatalog);
    expect(actualContext).not.toHaveProperty('project');
    expect(actualContext.needsProject).toBe(true);
  });

  it('keeps the catalog alongside a known project so the lead can switch', () => {
    const inputCatalog = [{ id: 'p2', title: 'Otro', location: 'x' }];
    const actualContext = parseContext(
      builder.buildMessages(buildInput({ project: mockProject, catalog: inputCatalog }))[1].content,
    );
    expect(actualContext.project).toMatchObject({ id: 'p1', title: 'Valle del Sol' });
    expect(actualContext.catalog).toEqual(inputCatalog);
    expect(actualContext.needsProject).toBe(false);
  });

  it('skips the last user message when nothing is pending', () => {
    const actualMessages = builder.buildMessages(buildInput({ pendingMessages: [] }));
    expect(actualMessages.map((message) => message.role)).toEqual(['system', 'system']);
  });
});
