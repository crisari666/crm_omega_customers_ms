import { Injectable } from '@nestjs/common';
import { LeadAssistantSettingsService } from '../../lead-assistant/lead-assistant-settings.service';
import { LeadFaqResolverService } from '../../lead-assistant/lead-faq-resolver.service';
import type { LeadResolvedFaq } from '../../lead-assistant/types/lead-resolved-faq.type';
import { pickBestLeadFaqMatch } from '../../lead-assistant/utils/score-lead-faq-match.util';
import { LEAD_AGENT_REPLY_GAP_MS, REPLY_ID } from '../constants/lead-conversation.constants';
import { LeadAdProjectResolverService } from '../lead-ad-project-resolver.service';
import { LeadFlowTransitionsService } from '../lead-flow-transitions.service';
import { LEAD_TEMPLATES } from '../templates/lead-conversation.templates';
import type { LeadConversationAnswers } from '../types/lead-conversation-answers.type';
import type { LeadConversationStatus } from '../types/lead-conversation-status.type';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadProfile } from '../types/lead-profile.type';
import type { OutboundMessagePlan } from '../types/outbound-message-plan.type';
import type { StepTransition } from '../types/step-transition.type';
import {
  LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY,
  LEAD_AGENT_FALLBACK_ASK_PROJECT_REPLY,
  LEAD_AGENT_FALLBACK_EXPLORING_REPLY,
  LEAD_AGENT_FALLBACK_REPLY,
  LEAD_AGENT_OPT_OUT_REPLY,
} from './constants/lead-agent.constants';
import { LeadAgentLlmService } from './lead-agent-llm.service';
import { LeadAgentPromptBuilder } from './lead-agent-prompt.builder';
import { LeadAgentScoringService } from './lead-agent-scoring.service';
import { LeadAgentStageService } from './lead-agent-stage.service';
import type { LeadAgentLlmTurn } from './types/lead-agent-llm-turn.type';
import type { LeadAgentMediaPlans } from './types/lead-agent-media-plans.type';
import type { LeadAgentPendingMessage } from './types/lead-agent-pending-message.type';
import type { LeadAgentSessionView } from './types/lead-agent-session-view.type';
import type { LeadAgentTurnDraft } from './types/lead-agent-turn-draft.type';
import type { LeadAgentTurnInput } from './types/lead-agent-turn-input.type';
import type { LeadAgentTurnOutcome } from './types/lead-agent-turn-outcome.type';
import type { ResolvedLeadProject } from './types/resolved-lead-project.type';
import { ProjectKnowledgeService } from './project-knowledge.service';
import { isLeadQualifiedToOfferCall } from './utils/lead-agent-can-offer-call.util';
import { buildLeadAgentMediaPlans } from './utils/build-lead-agent-media-plans.util';
import { parseLeadMotivationFromPending } from './utils/parse-lead-motivation-reply.util';

const SLOT_CHOICE_STEPS: readonly LeadConversationStep[] = [
  LeadConversationStep.AskSchedule,
  LeadConversationStep.AskCallSlot,
];

const withReplyGap = (plans: readonly OutboundMessagePlan[]): OutboundMessagePlan[] =>
  plans.map((plan, index) => (index === 0 ? { ...plan, delayMs: plan.delayMs ?? LEAD_AGENT_REPLY_GAP_MS } : plan));

const hasConfirmedProjectGate = (resolved: ResolvedLeadProject): boolean =>
  resolved.projectId !== undefined || resolved.isAllProjects === true;

const MOTIVATION_BY_REPLY_ID: Readonly<Record<string, NonNullable<LeadProfile['motivation']>>> = {
  [REPLY_ID.motivationBuild]: 'build',
  [REPLY_ID.motivationInvest]: 'invest',
  [REPLY_ID.motivationExploring]: 'exploring',
};

const needsMotivationButtons = (
  profile: LeadProfile,
  adoptedMotivationFromTap: boolean,
): boolean => {
  if (adoptedMotivationFromTap) return false;
  return profile.motivation === undefined || profile.motivation === 'exploring';
};

/**
 * Decides one V2 agent turn: project, FAQs, LLM answer, profile, signals, stage, score and outbound plans.
 * Pure orchestration: it persists nothing and sends nothing, and its transition never carries a `scoreEvent`.
 */
@Injectable()
export class LeadAgentEngineService {
  constructor(
    private readonly settingsService: LeadAssistantSettingsService,
    private readonly faqResolver: LeadFaqResolverService,
    private readonly adProjectResolver: LeadAdProjectResolverService,
    private readonly transitions: LeadFlowTransitionsService,
    private readonly knowledge: ProjectKnowledgeService,
    private readonly llm: LeadAgentLlmService,
    private readonly promptBuilder: LeadAgentPromptBuilder,
    private readonly scoring: LeadAgentScoringService,
    private readonly stageService: LeadAgentStageService,
  ) {}

  /** Answers the pending customer messages; the caller persists the transition and dispatches the plans. */
  async executeTurn(input: LeadAgentTurnInput): Promise<LeadAgentTurnOutcome> {
    const { session } = input;
    const settings = await this.settingsService.executeGetOrCreate();
    const resolved = await this.resolveProject(session, input.pendingMessages);
    const tappedMotivation = this.adoptMotivationFromPending(input.pendingMessages);
    const adoptedMotivationFromTap = tappedMotivation !== undefined;
    const catalog = await this.knowledge.executeGetCatalogSummary();
    const customerText = input.pendingMessages.map((message) => message.text).join('\n');
    const faqs = await this.faqResolver.executeResolve({
      projectId: resolved.projectId,
      customerText,
    });
    const promptSession = this.buildPromptSession(session, resolved, tappedMotivation);
    const messages = this.promptBuilder.buildMessages({
      assistantName: settings.assistantName,
      businessName: settings.businessName,
      greeting: settings.greeting,
      pricePolicy: settings.pricePolicy,
      session: promptSession,
      history: input.history,
      pendingMessages: input.pendingMessages,
      project: resolved.knowledge,
      ...(resolved.suggestedProject !== undefined && !hasConfirmedProjectGate(resolved)
        ? { suggestedProject: resolved.suggestedProject }
        : {}),
      catalog,
      faqs,
    });
    const turn = await this.llm.executeTurn(messages, {
      allowedProjectIds: new Set(catalog.map((item) => item.id)),
      allowedFaqIds: new Set(faqs.map((faq) => faq.id)),
    });
    if (turn === null) {
      return this.buildFallbackOutcome(session, resolved, input.pendingMessages, faqs, tappedMotivation);
    }
    return this.buildTurnOutcome(
      session,
      await this.applyTurnProject(resolved, turn),
      turn,
      tappedMotivation,
      adoptedMotivationFromTap,
    );
  }

  /**
   * Interactive project tap first, then session project / isAllProjects, else soft ad suggestion.
   */
  private async resolveProject(
    session: LeadAgentSessionView,
    pendingMessages: readonly LeadAgentPendingMessage[],
  ): Promise<ResolvedLeadProject> {
    const fromTap = await this.adoptProjectFromPending(pendingMessages);
    if (fromTap !== undefined) return fromTap;
    if (session.projectId !== undefined) {
      const knowledge = await this.knowledge.executeGetById(session.projectId);
      return {
        projectId: session.projectId,
        projectTitle: session.projectTitle ?? knowledge?.title,
        isNewlyResolved: false,
        knowledge,
      };
    }
    if (session.isAllProjects === true) {
      return { isNewlyResolved: false, isAllProjects: true };
    }
    if (session.customerId === undefined) return { isNewlyResolved: false };
    const adProject = await this.adProjectResolver.executeResolveForCustomer(session.customerId);
    if (adProject === undefined) return { isNewlyResolved: false };
    return {
      isNewlyResolved: false,
      suggestedProject: { id: adProject.id, title: adProject.title },
    };
  }

  /** Adopts `project:<id>` or `project:all` from the newest pending interactive reply. */
  private async adoptProjectFromPending(
    pendingMessages: readonly LeadAgentPendingMessage[],
  ): Promise<ResolvedLeadProject | undefined> {
    for (let index = pendingMessages.length - 1; index >= 0; index -= 1) {
      const replyId = pendingMessages[index]?.replyId;
      if (replyId === undefined) continue;
      if (replyId === REPLY_ID.allProjects) {
        return { isNewlyResolved: true, isAllProjects: true, adoptedFromTap: true };
      }
      if (!replyId.startsWith(REPLY_ID.projectPrefix)) continue;
      const projectId = replyId.slice(REPLY_ID.projectPrefix.length);
      if (projectId.length === 0 || projectId === 'all') continue;
      const knowledge = await this.knowledge.executeGetById(projectId);
      if (knowledge === undefined) continue;
      return {
        projectId: knowledge.id,
        projectTitle: knowledge.title,
        isNewlyResolved: true,
        isAllProjects: false,
        adoptedFromTap: true,
        knowledge,
      };
    }
    return undefined;
  }

  private buildPromptSession(
    session: LeadAgentSessionView,
    resolved: ResolvedLeadProject,
    tappedMotivation?: NonNullable<LeadProfile['motivation']>,
  ): LeadAgentSessionView {
    return {
      ...session,
      ...(resolved.projectId !== undefined
        ? { projectId: resolved.projectId, projectTitle: resolved.projectTitle }
        : {}),
      ...(resolved.isAllProjects === true ? { isAllProjects: true } : {}),
      ...(tappedMotivation !== undefined
        ? { leadProfile: { ...session.leadProfile, motivation: tappedMotivation } }
        : {}),
    };
  }

  /** Adopts `mot:build|invest|exploring` from the newest pending interactive reply. */
  private adoptMotivationFromPending(
    pendingMessages: readonly LeadAgentPendingMessage[],
  ): NonNullable<LeadProfile['motivation']> | undefined {
    for (let index = pendingMessages.length - 1; index >= 0; index -= 1) {
      const replyId = pendingMessages[index]?.replyId;
      if (replyId === undefined) continue;
      const motivation = MOTIVATION_BY_REPLY_ID[replyId];
      if (motivation !== undefined) return motivation;
    }
    return undefined;
  }

  /** Adopts or switches to the project the LLM picked from the catalog; unknown ids are dropped. */
  private async applyTurnProject(resolved: ResolvedLeadProject, turn: LeadAgentLlmTurn): Promise<ResolvedLeadProject> {
    if (turn.projectId === null) return resolved;
    if (resolved.projectId === turn.projectId) return resolved;
    const knowledge = await this.knowledge.executeGetById(turn.projectId);
    if (knowledge === undefined) return resolved;
    return {
      projectId: knowledge.id,
      projectTitle: knowledge.title,
      isNewlyResolved: true,
      isAllProjects: false,
      knowledge,
      ...(resolved.adoptedFromTap === true ? { adoptedFromTap: true } : {}),
    };
  }

  private async buildFallbackOutcome(
    session: LeadAgentSessionView,
    resolved: ResolvedLeadProject,
    pendingMessages: readonly LeadAgentPendingMessage[],
    faqs: readonly LeadResolvedFaq[],
    tappedMotivation?: NonNullable<LeadProfile['motivation']>,
  ): Promise<LeadAgentTurnOutcome> {
    const adoptedMotivationFromTap = tappedMotivation !== undefined;
    const profile = this.mergeFallbackMotivation(session, pendingMessages, tappedMotivation);
    const signals = this.scoring.deriveSignals(profile, [], session.scoreSignals);
    const customerText = pendingMessages.map((message) => message.text).join('\n');
    const bestFaq = pickBestLeadFaqMatch(customerText, faqs);
    if (bestFaq !== undefined) {
      return {
        transition: this.buildTransition(
          session,
          resolved,
          this.buildContinueFallbackDraft(session, bestFaq.faq.answer, profile, signals),
        ),
        usedFaqIds: [bestFaq.faq.id],
      };
    }
    if (!hasConfirmedProjectGate(resolved)) {
      const picker = await this.transitions.buildProjectPicker();
      const draft = this.buildContinueFallbackDraft(session, LEAD_AGENT_FALLBACK_ASK_PROJECT_REPLY, profile, signals);
      return {
        transition: this.buildTransition(session, resolved, {
          ...draft,
          outbound: [...draft.outbound, ...withReplyGap(picker.outbound)],
        }),
        usedFaqIds: [],
      };
    }
    const canOfferCall = isLeadQualifiedToOfferCall({
      projectId: resolved.projectId,
      motivation: profile.motivation,
      step: session.step,
    });
    if (!canOfferCall) {
      if (profile.motivation === 'exploring') {
        const draft = this.buildContinueFallbackDraft(
          session,
          LEAD_AGENT_FALLBACK_EXPLORING_REPLY,
          profile,
          signals,
        );
        const motivationOutbound = this.buildMotivationButtonsOutbound(
          resolved,
          profile,
          adoptedMotivationFromTap,
          true,
        );
        return {
          transition: this.buildTransition(session, resolved, {
            ...draft,
            outbound: [...draft.outbound, ...motivationOutbound],
          }),
          usedFaqIds: [],
        };
      }
      const motivationOutbound = this.buildMotivationButtonsOutbound(
        resolved,
        profile,
        adoptedMotivationFromTap,
        false,
        LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY,
      );
      return {
        transition: this.buildTransition(session, resolved, {
          outbound: motivationOutbound,
          nextStep: LeadConversationStep.V2Conversation,
          status: this.resolveStatus(session),
          profile,
          signals,
          intents: [],
          action: 'continue',
          isOptOut: false,
        }),
        usedFaqIds: [],
      };
    }
    const askSchedule = this.transitions.buildAskSchedule();
    const draft: LeadAgentTurnDraft = {
      outbound: [{ kind: 'text', body: LEAD_AGENT_FALLBACK_REPLY }, ...withReplyGap(askSchedule.outbound)],
      nextStep: LeadConversationStep.AskSchedule,
      status: this.resolveStatus(session),
      profile,
      signals,
      intents: [],
      action: 'offer_call_slots',
      isOptOut: false,
    };
    return { transition: this.buildTransition(session, resolved, draft), usedFaqIds: [] };
  }

  /** Adopts motivation from a tap, else parses inbound text when the profile still lacks one. */
  private mergeFallbackMotivation(
    session: LeadAgentSessionView,
    pendingMessages: readonly LeadAgentPendingMessage[],
    tappedMotivation?: NonNullable<LeadProfile['motivation']>,
  ): LeadProfile {
    if (tappedMotivation !== undefined) return { ...session.leadProfile, motivation: tappedMotivation };
    if (session.leadProfile.motivation !== undefined) return session.leadProfile;
    const motivation = parseLeadMotivationFromPending(pendingMessages.map((message) => message.text));
    if (motivation === undefined) return session.leadProfile;
    return { ...session.leadProfile, motivation };
  }

  private buildContinueFallbackDraft(
    session: LeadAgentSessionView,
    body: string,
    profile: LeadProfile = session.leadProfile,
    signals: readonly string[] = session.scoreSignals,
  ): LeadAgentTurnDraft {
    return {
      outbound: [{ kind: 'text', body }],
      nextStep: LeadConversationStep.V2Conversation,
      status: this.resolveStatus(session),
      profile,
      signals,
      intents: [],
      action: 'continue',
      isOptOut: false,
    };
  }

  private async buildTurnOutcome(
    session: LeadAgentSessionView,
    resolved: ResolvedLeadProject,
    turn: LeadAgentLlmTurn,
    tappedMotivation?: NonNullable<LeadProfile['motivation']>,
    adoptedMotivationFromTap = false,
  ): Promise<LeadAgentTurnOutcome> {
    const profile: LeadProfile = {
      ...session.leadProfile,
      ...turn.profile,
      ...(tappedMotivation !== undefined ? { motivation: tappedMotivation } : {}),
    };
    const signals = this.scoring.deriveSignals(profile, turn.intents, session.scoreSignals);
    const draft =
      turn.action === 'opt_out'
        ? this.buildOptOutDraft(profile, signals, turn)
        : await this.buildContinueDraft(session, resolved, profile, signals, turn, adoptedMotivationFromTap);
    return {
      transition: this.buildTransition(session, resolved, draft),
      usedFaqIds: turn.usedFaqIds,
      ...(turn.unansweredQuestion !== null ? { unansweredQuestion: turn.unansweredQuestion } : {}),
    };
  }

  private buildOptOutDraft(profile: LeadProfile, signals: readonly string[], turn: LeadAgentLlmTurn): LeadAgentTurnDraft {
    return {
      outbound: [{ kind: 'text', body: LEAD_AGENT_OPT_OUT_REPLY }],
      nextStep: LeadConversationStep.Closed,
      status: 'disqualified',
      answersPatch: this.buildAnswersPatch(profile),
      profile,
      signals,
      intents: turn.intents,
      action: turn.action,
      isOptOut: true,
    };
  }

  private async buildContinueDraft(
    session: LeadAgentSessionView,
    resolved: ResolvedLeadProject,
    profile: LeadProfile,
    signals: readonly string[],
    turn: LeadAgentLlmTurn,
    adoptedMotivationFromTap = false,
  ): Promise<LeadAgentTurnDraft> {
    const action = this.coerceAction(session, resolved, profile, turn);
    const isOfferingSlots = action === 'offer_call_slots';
    const media = this.buildMedia(resolved, profile, { ...turn, action });
    const slots = isOfferingSlots ? await this.buildSlotTransition(session, turn) : undefined;
    const pickerOutbound = await this.buildProjectPickerOutbound(resolved, action);
    const preceding: OutboundMessagePlan[] = [
      ...this.buildReplyPlans(turn.replies),
      ...media.plans,
      ...withReplyGap(slots?.outbound ?? []),
      ...pickerOutbound,
    ];
    const motivationOutbound = this.buildMotivationButtonsOutbound(
      resolved,
      profile,
      adoptedMotivationFromTap,
      preceding.length > 0,
    );
    return {
      outbound: [...preceding, ...motivationOutbound],
      nextStep: slots?.nextStep ?? this.resolveNextStep(session),
      status: this.resolveStatus(session),
      answersPatch: this.buildAnswersPatch(profile, slots?.answersPatch),
      profile: media.sent.length > 0 ? { ...profile, sentMedia: [...(profile.sentMedia ?? []), ...media.sent] } : profile,
      signals: isOfferingSlots ? [...new Set([...signals, 'accepted_call'])] : signals,
      intents: turn.intents,
      action,
      isOptOut: false,
    };
  }

  /** Appends the V1-style interactive project selector when a project is needed or the model asks to resend it. */
  private async buildProjectPickerOutbound(
    resolved: ResolvedLeadProject,
    action: LeadAgentLlmTurn['action'],
  ): Promise<OutboundMessagePlan[]> {
    if (resolved.adoptedFromTap === true) return [];
    const needsPicker = !hasConfirmedProjectGate(resolved) || action === 'offer_projects';
    if (!needsPicker) return [];
    const picker = await this.transitions.buildProjectPicker();
    return withReplyGap(picker.outbound);
  }

  /**
   * Appends motivation reply buttons when the project gate is open and motivation is still unknown or exploring.
   * Short body when text already precedes; full ask when buttons are the sole outbound.
   */
  private buildMotivationButtonsOutbound(
    resolved: ResolvedLeadProject,
    profile: LeadProfile,
    adoptedMotivationFromTap: boolean,
    hasPrecedingText: boolean,
    soleAskBody: string = LEAD_TEMPLATES.askMotivationPicker,
  ): OutboundMessagePlan[] {
    if (!hasConfirmedProjectGate(resolved)) return [];
    if (!needsMotivationButtons(profile, adoptedMotivationFromTap)) return [];
    const body = hasPrecedingText ? LEAD_TEMPLATES.askMotivationChoice : soleAskBody;
    const plans = this.transitions.buildAskMotivation(body).outbound;
    return hasPrecedingText ? withReplyGap(plans) : [...plans];
  }

  /**
   * Without a project gate: no media or slots.
   * Without buyer motivation: no slots (media still allowed once a project exists).
   * FAQ knowledge turns: no slots unless the customer asked for a call (`wants_call`).
   */
  private coerceAction(
    session: LeadAgentSessionView,
    resolved: ResolvedLeadProject,
    profile: LeadProfile,
    turn: LeadAgentLlmTurn,
  ): LeadAgentLlmTurn['action'] {
    const { action } = turn;
    if (!hasConfirmedProjectGate(resolved)) {
      if (action === 'offer_call_slots' || action === 'send_media') return 'continue';
      return action;
    }
    if (action !== 'offer_call_slots') return action;
    if (turn.usedFaqIds.length > 0 && !turn.intents.includes('wants_call')) {
      return 'continue';
    }
    const canOfferCall = isLeadQualifiedToOfferCall({
      projectId: resolved.projectId,
      motivation: profile.motivation,
      step: session.step,
    });
    return canOfferCall ? action : 'continue';
  }

  private buildMedia(resolved: ResolvedLeadProject, profile: LeadProfile, turn: LeadAgentLlmTurn): LeadAgentMediaPlans {
    if (turn.action !== 'send_media') return { plans: [], sent: [] };
    return buildLeadAgentMediaPlans(turn.media, resolved.knowledge, profile.sentMedia ?? []);
  }

  private async buildSlotTransition(session: LeadAgentSessionView, turn: LeadAgentLlmTurn): Promise<StepTransition> {
    return turn.callPeriod === null
      ? this.transitions.buildAskSchedule()
      : this.transitions.buildAskCallSlot(turn.callPeriod, false, session.customerId);
  }

  private buildReplyPlans(replies: readonly string[]): OutboundMessagePlan[] {
    return replies.map((body, index) => ({
      kind: 'text',
      body,
      ...(index > 0 ? { delayMs: LEAD_AGENT_REPLY_GAP_MS } : {}),
    }));
  }

  /** Waiting for a slot choice stays on the same step; after booking stays on `scheduled`. */
  private resolveNextStep(session: LeadAgentSessionView): LeadConversationStep {
    if (SLOT_CHOICE_STEPS.includes(session.step) || session.step === LeadConversationStep.Scheduled) return session.step;
    return LeadConversationStep.V2Conversation;
  }

  private resolveStatus(session: LeadAgentSessionView): LeadConversationStatus | undefined {
    return session.status === 'abandoned' ? 'active' : undefined;
  }

  private buildAnswersPatch(
    profile: LeadProfile,
    slotAnswers?: Partial<LeadConversationAnswers>,
  ): Partial<LeadConversationAnswers> | undefined {
    const patch: Partial<LeadConversationAnswers> = {
      ...(profile.paymentMethod !== undefined ? { formaPago: profile.paymentMethod } : {}),
      ...(profile.lotPreference !== undefined ? { rangoLote: profile.lotPreference } : {}),
      ...slotAnswers,
    };
    return Object.keys(patch).length > 0 ? patch : undefined;
  }

  private buildProjectSessionPatch(
    session: LeadAgentSessionView,
    resolved: ResolvedLeadProject,
  ): Partial<{ projectId: string; projectTitle: string; isAllProjects: boolean }> {
    if (resolved.isAllProjects === true && (resolved.isNewlyResolved || session.isAllProjects !== true)) {
      return { isAllProjects: true };
    }
    if (
      resolved.projectId !== undefined &&
      (resolved.isNewlyResolved || session.projectId === undefined)
    ) {
      return {
        projectId: resolved.projectId,
        ...(resolved.projectTitle !== undefined ? { projectTitle: resolved.projectTitle } : {}),
        isAllProjects: false,
      };
    }
    return {};
  }

  private buildTransition(
    session: LeadAgentSessionView,
    resolved: ResolvedLeadProject,
    draft: LeadAgentTurnDraft,
  ): StepTransition {
    const status = draft.status ?? session.status;
    const hasNewHighIntent =
      draft.signals.includes('high_intent_question') && !session.scoreSignals.includes('high_intent_question');
    const hasProject = hasConfirmedProjectGate(resolved);
    const canOfferCall = isLeadQualifiedToOfferCall({
      projectId: resolved.projectId,
      motivation: draft.profile.motivation,
      step: draft.nextStep,
    });
    const leadProfile = this.stageService.applyStage({
      profile: draft.profile,
      nextStep: draft.nextStep,
      status,
      intents: draft.intents,
      action: draft.action,
      hasNewHighIntent,
      hasProject,
      canOfferCall,
    });
    const score = this.scoring.computeScore(draft.signals);
    const temperature = draft.isOptOut ? 'cold' : this.scoring.deriveTemperature(score);
    const priority = draft.isOptOut ? 1 : this.scoring.derivePriority(temperature);
    return {
      nextStep: draft.nextStep,
      ...(draft.status !== undefined ? { status: draft.status } : {}),
      ...(draft.answersPatch !== undefined ? { answersPatch: draft.answersPatch } : {}),
      sessionPatch: {
        leadProfile,
        scoreSignals: draft.signals,
        score,
        priority,
        temperature,
        ...this.buildProjectSessionPatch(session, resolved),
        ...(draft.isOptOut ? { optedOutAt: new Date() } : {}),
      },
      outbound: draft.outbound,
      expectsReply: !draft.isOptOut,
    };
  }
}
