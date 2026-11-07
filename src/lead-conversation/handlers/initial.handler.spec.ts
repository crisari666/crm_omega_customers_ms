import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { ProjectMatcherService } from '../project-matcher.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { InboundLeadMessage } from '../types/inbound-lead-message.type';
import type { LeadSessionSnapshot } from '../lead-conversation-session.service';
import { InitialHandler } from './initial.handler';

const FABIAN_FORM_BODY = `¡Hola! He completado el formulario y me gustaría recibir más información sobre vuestro negocio.

Full name: Fabian Pinilla
¿Cuánto tienes disponible para invertir?: Entre $1’000.000 COP y $35’000.000 COP
City: Bogotá
Phone number: +573102488075
¿Tienes conocimiento de que nuestro proyecto está ubicado en Carmen de Apicalá, Tolima?: Si
Email: nestor004@hotmail.com
Inbox URL:`;

describe('InitialHandler', () => {
  const mockMatcher = { findProjectInText: jest.fn() };
  const mockTransitions = {
    buildAskProject: jest.fn(),
    buildProjectIntro: jest.fn(),
  };
  let handler: InitialHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransitions.buildAskProject.mockResolvedValue({
      nextStep: LeadConversationStep.AskProject,
      outbound: [{ kind: 'list', body: 'projects' }],
      expectsReply: true,
    });
    handler = new InitialHandler(
      mockMatcher as unknown as ProjectMatcherService,
      mockTransitions as unknown as LeadFlowTransitionsService,
    );
  });

  it('bootstraps Instant Form dump to ask_project without project matching', async () => {
    const session = { firstName: 'Fabian', step: LeadConversationStep.Initial } as LeadSessionSnapshot;
    const message = {
      text: FABIAN_FORM_BODY,
      isInstantFormDump: true,
      waId: '573102488075',
      wamid: 'wamid.1',
      phoneNumberId: '1',
      profileName: 'Fabian Pinilla',
      type: 'text',
      timestamp: new Date(),
    } as InboundLeadMessage;
    const actual = await handler.handle({ session, message });
    expect(mockMatcher.findProjectInText).not.toHaveBeenCalled();
    expect(mockTransitions.buildAskProject).toHaveBeenCalledWith(session);
    expect(actual.nextStep).toBe(LeadConversationStep.AskProject);
    expect(actual.sessionPatch).toEqual({ identityBootstrappedFromForm: true });
  });
});
