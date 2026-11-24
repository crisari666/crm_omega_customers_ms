import { BadRequestException } from '@nestjs/common';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { StepTransition } from '../types/step-transition.type';
import { LeadAgentScoringService } from './lead-agent-scoring.service';
import { LeadAgentSimulatorService } from './lead-agent-simulator.service';
import type { SimulateLeadAgentDto } from './dto/simulate-lead-agent.dto';
import type { LeadAgentTurnOutcome } from './types/lead-agent-turn-outcome.type';
import type { SimulatedLeadState } from './types/simulated-lead-state.type';

const mockTransition: StepTransition = {
  nextStep: LeadConversationStep.AskCallSlot,
  answersPatch: { formaPago: 'cash', horarioLlamada: 'morning' },
  sessionPatch: {
    projectId: 'p1',
    projectTitle: 'Valle del Sol',
    leadProfile: { stage: 'booking', stageTurns: 0, paymentMethod: 'cash' },
    scoreSignals: ['payment_known', 'accepted_call'],
    score: 20,
    priority: 1,
    temperature: 'cold',
  },
  outbound: [
    { kind: 'text', body: 'Perfecto, te propongo una llamada.' },
    { kind: 'list', body: 'Elige un horario', options: [{ id: 'slot:1', title: 'Lunes 9:00' }], delayMs: 1500 },
    { kind: 'document', mediaUrl: 'https://rag.test/plane.pdf' },
  ],
  expectsReply: true,
};

const buildService = () => {
  const mockOutcome: LeadAgentTurnOutcome = { transition: mockTransition, usedFaqIds: ['f1'], unansweredQuestion: '¿Hay descuento?' };
  const mockEngine = { executeTurn: jest.fn().mockResolvedValue(mockOutcome) };
  const mockKnowledge = {
    executeGetById: jest.fn().mockImplementation(async (id: string) => (id === 'p1' ? { id: 'p1', title: 'Valle del Sol' } : undefined)),
  };
  const mockFaqResolver = {
    executeResolve: jest.fn().mockResolvedValue([
      { id: 'f1', question: '¿Cuál es el precio?', answer: 'x', category: 'price' },
      { id: 'f2', question: 'Otra', answer: 'y', category: 'other' },
    ]),
    executeMarkUsed: jest.fn(),
  };
  const service = new LeadAgentSimulatorService(
    mockEngine as never,
    mockKnowledge as never,
    mockFaqResolver as never,
    new LeadAgentScoringService(),
  );
  return { service, mockEngine, mockKnowledge, mockFaqResolver };
};

describe('LeadAgentSimulatorService.executeSimulate', () => {
  it('starts a fresh conversation without a customer and sends the message as pending', async () => {
    const { service, mockEngine } = buildService();
    await service.executeSimulate({ message: 'Hola, ¿cuánto cuesta?' });
    const actualInput = mockEngine.executeTurn.mock.calls[0][0];
    expect(actualInput.session).toMatchObject({
      firstName: 'Camila',
      step: LeadConversationStep.V2Conversation,
      status: 'active',
      leadProfile: {},
      scoreSignals: [],
    });
    expect(actualInput.session.customerId).toBeUndefined();
    expect(actualInput.history).toEqual([]);
    expect(actualInput.pendingMessages).toEqual([{ text: 'Hola, ¿cuánto cuesta?' }]);
  });

  it('applies the transition in memory and appends the transcript', async () => {
    const { service } = buildService();
    const actualResponse = await service.executeSimulate({ message: 'Pago de contado' });
    expect(actualResponse.state).toMatchObject({
      step: LeadConversationStep.AskCallSlot,
      status: 'active',
      projectId: 'p1',
      projectTitle: 'Valle del Sol',
      leadProfile: { stage: 'booking', paymentMethod: 'cash' },
      scoreSignals: ['payment_known', 'accepted_call'],
      answers: { formaPago: 'cash', horarioLlamada: 'morning' },
    });
    expect(actualResponse.state.transcript).toEqual([
      { direction: 'inbound', body: 'Pago de contado' },
      { direction: 'outbound', body: 'Perfecto, te propongo una llamada.' },
      { direction: 'outbound', body: 'Elige un horario' },
      { direction: 'outbound', body: '[document]' },
    ]);
  });

  it('returns the replies without internal fields', async () => {
    const { service } = buildService();
    const { replies } = await service.executeSimulate({ message: 'Hola' });
    expect(replies).toEqual([
      { kind: 'text', body: 'Perfecto, te propongo una llamada.' },
      { kind: 'list', body: 'Elige un horario', options: [{ id: 'slot:1', title: 'Lunes 9:00' }] },
      { kind: 'document', mediaUrl: 'https://rag.test/plane.pdf' },
    ]);
  });

  it('returns insights with the score out of 100 and the used FAQs', async () => {
    const { service, mockFaqResolver } = buildService();
    const { insights } = await service.executeSimulate({ message: 'Hola' });
    expect(insights).toEqual({
      stage: 'booking',
      profile: { stage: 'booking', stageTurns: 0, paymentMethod: 'cash' },
      score: 20,
      maxScore: 100,
      temperature: 'cold',
      signals: ['payment_known', 'accepted_call'],
      usedFaqs: [{ id: 'f1', question: '¿Cuál es el precio?' }],
      unansweredQuestion: '¿Hay descuento?',
    });
    expect(mockFaqResolver.executeMarkUsed).not.toHaveBeenCalled();
  });

  it('continues from the given state and feeds its transcript as history', async () => {
    const { service, mockEngine } = buildService();
    const inputState: SimulatedLeadState = {
      firstName: 'Andrés',
      step: LeadConversationStep.V2Conversation,
      status: 'active',
      projectId: 'p1',
      projectTitle: 'Valle del Sol',
      leadProfile: { stage: 'discovery' },
      scoreSignals: ['motivation_known'],
      transcript: [{ direction: 'outbound', body: 'Hola Andrés' }],
    };
    const actualResponse = await service.executeSimulate({ message: 'Hola', state: inputState } as SimulateLeadAgentDto);
    const actualInput = mockEngine.executeTurn.mock.calls[0][0];
    expect(actualInput.session.firstName).toBe('Andrés');
    expect(actualInput.history).toEqual(inputState.transcript);
    expect(actualResponse.state.transcript[0]).toEqual({ direction: 'outbound', body: 'Hola Andrés' });
  });

  it('sets the project of a fresh conversation from projectId', async () => {
    const { service, mockEngine } = buildService();
    await service.executeSimulate({ message: 'Hola', projectId: 'p1' });
    expect(mockEngine.executeTurn.mock.calls[0][0].session).toMatchObject({ projectId: 'p1', projectTitle: 'Valle del Sol' });
  });

  it('rejects an unknown projectId', async () => {
    const { service, mockEngine } = buildService();
    await expect(service.executeSimulate({ message: 'Hola', projectId: 'ghost' })).rejects.toBeInstanceOf(BadRequestException);
    expect(mockEngine.executeTurn).not.toHaveBeenCalled();
  });
});
