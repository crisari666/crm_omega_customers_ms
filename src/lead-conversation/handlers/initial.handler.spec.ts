import { Types } from 'mongoose';
import { LeadAdProjectResolverService } from '../lead-ad-project-resolver.service';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { ProjectMatcherService } from '../project-matcher.service';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { InboundLeadMessage } from '../types/inbound-lead-message.type';
import type { LeadProject } from '../types/lead-project.type';
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

const MOCK_PROJECT: LeadProject = {
  id: 'proj-1',
  title: 'Parque del Agua',
  shortDescription: 'Lotes en Carmen de Apicalá',
  plane: 'plane.pdf',
  lotOptions: [],
};

describe('InitialHandler', () => {
  const mockMatcher = { findProjectInText: jest.fn() };
  const mockTransitions = {
    buildAskProject: jest.fn(),
    buildProjectIntro: jest.fn(),
  };
  const mockAdResolver = { executeResolveForCustomer: jest.fn() };
  let handler: InitialHandler;
  const customerId = new Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransitions.buildAskProject.mockResolvedValue({
      nextStep: LeadConversationStep.AskProject,
      outbound: [{ kind: 'list', body: 'projects' }],
      expectsReply: true,
      sessionPatch: {},
    });
    mockTransitions.buildProjectIntro.mockResolvedValue({
      nextStep: LeadConversationStep.AskLotRange,
      outbound: [{ kind: 'text', body: 'intro' }],
      expectsReply: true,
      sessionPatch: { projectId: MOCK_PROJECT.id, projectTitle: MOCK_PROJECT.title },
    });
    mockAdResolver.executeResolveForCustomer.mockResolvedValue(undefined);
    handler = new InitialHandler(
      mockMatcher as unknown as ProjectMatcherService,
      mockTransitions as unknown as LeadFlowTransitionsService,
      mockAdResolver as unknown as LeadAdProjectResolverService,
    );
  });

  it('bootstraps Instant Form dump to ask_project when no ad project mapping', async () => {
    const session = {
      firstName: 'Fabian',
      step: LeadConversationStep.Initial,
      customerId,
    } as LeadSessionSnapshot;
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
    expect(mockAdResolver.executeResolveForCustomer).toHaveBeenCalledWith(customerId);
    expect(mockTransitions.buildAskProject).toHaveBeenCalledWith(session);
    expect(mockTransitions.buildProjectIntro).not.toHaveBeenCalled();
    expect(actual.nextStep).toBe(LeadConversationStep.AskProject);
    expect(actual.sessionPatch).toEqual({ identityBootstrappedFromForm: true });
  });

  it('bootstraps Instant Form dump to project intro when ad maps to a project', async () => {
    mockAdResolver.executeResolveForCustomer.mockResolvedValue(MOCK_PROJECT);
    const session = {
      firstName: 'Fabian',
      step: LeadConversationStep.Initial,
      customerId,
    } as LeadSessionSnapshot;
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
    expect(mockTransitions.buildProjectIntro).toHaveBeenCalledWith(session, MOCK_PROJECT);
    expect(mockTransitions.buildAskProject).not.toHaveBeenCalled();
    expect(actual.nextStep).toBe(LeadConversationStep.AskLotRange);
    expect(actual.sessionPatch).toEqual({
      projectId: MOCK_PROJECT.id,
      projectTitle: MOCK_PROJECT.title,
      identityBootstrappedFromForm: true,
    });
  });
});
