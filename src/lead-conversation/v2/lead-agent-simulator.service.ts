import { BadRequestException, Injectable } from '@nestjs/common';
import { LeadFaqResolverService } from '../../lead-assistant/lead-faq-resolver.service';
import { MAX_SCORE_V2 } from '../constants/lead-conversation.constants';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { OutboundMessagePlan } from '../types/outbound-message-plan.type';
import type { StepTransition } from '../types/step-transition.type';
import { LEAD_AGENT_SIMULATOR_DEFAULT_FIRST_NAME } from './constants/lead-agent.constants';
import type { SimulateLeadAgentDto } from './dto/simulate-lead-agent.dto';
import { LeadAgentEngineService } from './lead-agent-engine.service';
import { LeadAgentScoringService } from './lead-agent-scoring.service';
import type { LeadAgentHistoryMessage } from './types/lead-agent-history-message.type';
import type { LeadAgentSessionView } from './types/lead-agent-session-view.type';
import type { LeadAgentSimulateResponse } from './types/lead-agent-simulate-response.type';
import type { LeadAgentSimulatedReply } from './types/lead-agent-simulated-reply.type';
import type { LeadAgentSimulatorInsights } from './types/lead-agent-simulator-insights.type';
import type { LeadAgentTurnOutcome } from './types/lead-agent-turn-outcome.type';
import type { SimulatedLeadState } from './types/simulated-lead-state.type';
import { ProjectKnowledgeService } from './project-knowledge.service';

const buildInitialState = (): SimulatedLeadState => ({
  firstName: LEAD_AGENT_SIMULATOR_DEFAULT_FIRST_NAME,
  step: LeadConversationStep.V2Conversation,
  status: 'active',
  leadProfile: {},
  scoreSignals: [],
  transcript: [],
});

const buildReply = (plan: OutboundMessagePlan): LeadAgentSimulatedReply => ({
  kind: plan.kind,
  ...(plan.body !== undefined ? { body: plan.body } : {}),
  ...(plan.options !== undefined ? { options: plan.options } : {}),
  ...(plan.mediaUrl !== undefined ? { mediaUrl: plan.mediaUrl } : {}),
});

const buildOutboundHistory = (plan: OutboundMessagePlan): LeadAgentHistoryMessage => ({
  direction: 'outbound',
  body: plan.body ?? `[${plan.kind}]`,
});

/**
 * Admin sandbox of the V2 agent: runs one real engine turn against an in-memory conversation.
 * It never touches Mongo, never dispatches WhatsApp messages and never books a slot.
 */
@Injectable()
export class LeadAgentSimulatorService {
  constructor(
    private readonly engine: LeadAgentEngineService,
    private readonly knowledge: ProjectKnowledgeService,
    private readonly faqResolver: LeadFaqResolverService,
    private readonly scoring: LeadAgentScoringService,
  ) {}

  /** Answers `dto.message` on top of `dto.state` (or a fresh conversation) and returns the next state. */
  async executeSimulate(dto: SimulateLeadAgentDto): Promise<LeadAgentSimulateResponse> {
    const state = await this.resolveState(dto);
    const outcome = await this.engine.executeTurn({
      session: this.buildSessionView(state),
      history: state.transcript,
      pendingMessages: [{ text: dto.message }],
    });
    const nextState = this.applyTransition(state, dto.message, outcome.transition);
    return {
      replies: outcome.transition.outbound.map(buildReply),
      state: nextState,
      insights: await this.buildInsights(nextState, outcome),
    };
  }

  private async resolveState(dto: SimulateLeadAgentDto): Promise<SimulatedLeadState> {
    const base: SimulatedLeadState = dto.state ?? buildInitialState();
    if (dto.projectId === undefined || dto.projectId === base.projectId) return base;
    const project = await this.knowledge.executeGetById(dto.projectId);
    if (project === undefined) throw new BadRequestException('El proyecto indicado no existe o no está habilitado');
    return { ...base, projectId: project.id, projectTitle: project.title };
  }

  /** The simulated lead has no customer, so no ad project lookup and no per-ventor slots. */
  private buildSessionView(state: SimulatedLeadState): LeadAgentSessionView {
    return {
      firstName: state.firstName,
      step: state.step,
      status: state.status,
      projectId: state.projectId,
      projectTitle: state.projectTitle,
      leadProfile: state.leadProfile,
      scoreSignals: state.scoreSignals,
      answers: state.answers ?? {},
      pendingOptions: [],
    };
  }

  private applyTransition(state: SimulatedLeadState, message: string, transition: StepTransition): SimulatedLeadState {
    const patch = transition.sessionPatch;
    return {
      ...state,
      step: transition.nextStep,
      status: transition.status ?? state.status,
      projectId: patch?.projectId ?? state.projectId,
      projectTitle: patch?.projectTitle ?? state.projectTitle,
      leadProfile: patch?.leadProfile ?? state.leadProfile,
      scoreSignals: patch?.scoreSignals ?? state.scoreSignals,
      answers: { ...(state.answers ?? {}), ...(transition.answersPatch ?? {}) },
      transcript: [
        ...state.transcript,
        { direction: 'inbound', body: message },
        ...transition.outbound.map(buildOutboundHistory),
      ],
    };
  }

  private async buildInsights(state: SimulatedLeadState, outcome: LeadAgentTurnOutcome): Promise<LeadAgentSimulatorInsights> {
    const patch = outcome.transition.sessionPatch;
    const score = patch?.score ?? this.scoring.computeScore(state.scoreSignals);
    return {
      stage: state.leadProfile.stage ?? 'opening',
      profile: state.leadProfile,
      score,
      maxScore: MAX_SCORE_V2,
      temperature: patch?.temperature ?? this.scoring.deriveTemperature(score),
      signals: state.scoreSignals,
      usedFaqs: await this.resolveUsedFaqs(state.projectId, outcome.usedFaqIds),
      ...(outcome.unansweredQuestion !== undefined ? { unansweredQuestion: outcome.unansweredQuestion } : {}),
    };
  }

  private async resolveUsedFaqs(
    projectId: string | undefined,
    usedFaqIds: readonly string[],
  ): Promise<{ id: string; question: string }[]> {
    if (usedFaqIds.length === 0) return [];
    const faqs = await this.faqResolver.executeResolve({ projectId });
    return faqs.filter((faq) => usedFaqIds.includes(faq.id)).map((faq) => ({ id: faq.id, question: faq.question }));
  }
}
