import { Injectable, Logger } from '@nestjs/common';
import { LeadAssistantSettingsService } from '../../lead-assistant/lead-assistant-settings.service';
import { LeadFaqResolverService } from '../../lead-assistant/lead-faq-resolver.service';
import type { LeadPricePolicy } from '../../lead-assistant/types/lead-price-policy.type';
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
import { interpolateTemplate } from '../utils/interpolate-template.util';
import {
  extractFormFieldsFromLeadText,
  type LeadFormFieldsFromText,
} from '../utils/extract-form-fields-from-lead-text.util';
import {
  LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY,
  LEAD_AGENT_FALLBACK_BUYER_CONTINUE_REPLY,
  LEAD_AGENT_FALLBACK_EXPLORING_REPLY,
  LEAD_AGENT_FALLBACK_REPLY,
  LEAD_AGENT_OPT_OUT_REPLY,
} from './constants/lead-agent.constants';
import { LeadAgentGuidedPathService } from './lead-agent-guided-path.service';
import { LeadAgentLlmService } from './lead-agent-llm.service';
import { LeadAgentPromptBuilder } from './lead-agent-prompt.builder';
import { LeadAgentScoringService } from './lead-agent-scoring.service';
import { LeadAgentStageService } from './lead-agent-stage.service';
import { LeadCaptureSyncService } from './lead-capture-sync.service';
import type { LeadAgentLlmTurn } from './types/lead-agent-llm-turn.type';
import type { LeadAgentMediaPlans } from './types/lead-agent-media-plans.type';
import type { LeadAgentPendingMessage } from './types/lead-agent-pending-message.type';
import type { LeadAgentSessionView } from './types/lead-agent-session-view.type';
import type { LeadAgentTurnDraft } from './types/lead-agent-turn-draft.type';
import type { LeadAgentTurnInput } from './types/lead-agent-turn-input.type';
import type { LeadAgentTurnOutcome } from './types/lead-agent-turn-outcome.type';
import type { ProjectKnowledge } from './types/project-knowledge.type';
import type { ResolvedLeadProject } from './types/resolved-lead-project.type';
import { ProjectKnowledgeService } from './project-knowledge.service';
import { adoptLeadCaptureFromReplyId } from './utils/adopt-lead-capture-reply.util';
import { isLeadQualifiedToOfferCall } from './utils/lead-agent-can-offer-call.util';
import { buildLeadAgentMediaPlans } from './utils/build-lead-agent-media-plans.util';
import type { LeadCaptureFieldKey, LeadCaptureKnown } from './utils/lead-capture-fields.util';
import {
  buildCaptureKnown,
  listMissingCaptureFields,
  mapMotivationToBuyMotive,
  resolveNextCaptureField,
} from './utils/lead-capture-fields.util';
import { parseLeadMotivationFromPending } from './utils/parse-lead-motivation-reply.util';
import { parseLeadPaymentFromPending } from './utils/parse-lead-payment-reply.util';
import { buildProjectFinancing } from './utils/build-project-financing.util';

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

const BUYER_MOTIVATIONS: ReadonlySet<NonNullable<LeadProfile['motivation']>> = new Set([
  'build',
  'invest',
  'leisure',
]);

const isBuyerMotivation = (motivation?: LeadProfile['motivation']): boolean =>
  motivation !== undefined && BUYER_MOTIVATIONS.has(motivation);

const lacksBuyerMotivation = (motivation?: LeadProfile['motivation']): boolean =>
  motivation === undefined || motivation === 'exploring';

const needsMotivationButtons = (
  profile: LeadProfile,
  adoptedMotivationThisTurn: boolean,
): boolean => {
  if (adoptedMotivationThisTurn) return false;
  return lacksBuyerMotivation(profile.motivation);
};

const OUTBOUND_BODY_PREVIEW_CHARS = 80;

const PROJECT_TEASER_PREFIX = 'Perfecto. 🌿';

const previewOutbound = (
  plans: readonly OutboundMessagePlan[],
): readonly { readonly kind: string; readonly bodyPreview: string }[] =>
  plans.map((plan) => ({
    kind: plan.kind,
    bodyPreview: (plan.body ?? '').replace(/\s+/g, ' ').trim().slice(0, OUTBOUND_BODY_PREVIEW_CHARS),
  }));

/** System project teaser from `composeProjectTeaser` — kept when stripping AI text on first greeting. */
const isProjectTeaserPlan = (plan: OutboundMessagePlan): boolean =>
  plan.kind === 'text' && (plan.body ?? '').trimStart().startsWith(PROJECT_TEASER_PREFIX);

/**
 * Decides one V2 agent turn: project, FAQs, LLM answer, profile, signals, stage, score and outbound plans.
 * Pure orchestration: it persists nothing and sends nothing, and its transition never carries a `scoreEvent`.
 */
@Injectable()
export class LeadAgentEngineService {
  private readonly logger = new Logger(LeadAgentEngineService.name);

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
    private readonly captureSync: LeadCaptureSyncService,
    private readonly guidedPath: LeadAgentGuidedPathService,
  ) {}

  /** Answers the pending customer messages; the caller persists the transition and dispatches the plans. */
  async executeTurn(input: LeadAgentTurnInput): Promise<LeadAgentTurnOutcome> {
    const { session } = input;
    const customerKey = session.customerId !== undefined ? String(session.customerId) : 'none';
    this.logger.log(
      `turn start customer=${customerKey} step=${session.step} status=${session.status} ` +
        `sessionProject=${session.projectId ?? 'none'} pending=${JSON.stringify(
          input.pendingMessages.map((message) => ({
            text: message.text.slice(0, OUTBOUND_BODY_PREVIEW_CHARS),
            replyId: message.replyId ?? null,
          })),
        )}`,
    );
    const settings = await this.settingsService.executeGetOrCreate();
    const formFields = this.parseInstantFormFields(input.pendingMessages);
    const shouldAdoptSuggested =
      formFields !== undefined && formFields.rejectsSuggestedLocation !== true;
    const resolved = await this.resolveProject(session, input.pendingMessages, shouldAdoptSuggested);
    this.logger.log(
      `resolveProject customer=${customerKey} projectId=${resolved.projectId ?? 'none'} ` +
        `title=${resolved.projectTitle ?? 'none'} suggested=${resolved.suggestedProject?.id ?? 'none'} ` +
        `suggestedTitle=${resolved.suggestedProject?.title ?? 'none'} newlyResolved=${resolved.isNewlyResolved === true} ` +
        `adoptSuggested=${shouldAdoptSuggested} fromTap=${resolved.adoptedFromTap === true} ` +
        `allProjects=${resolved.isAllProjects === true}`,
    );
    const pendingTexts = input.pendingMessages.map((message) => message.text);
    const tappedCapture = this.adoptCaptureFromPending(input.pendingMessages);
    const tappedLotArea = this.adoptLotAreaFromPending(input.pendingMessages);
    const tappedMotivation = this.adoptMotivationFromPending(input.pendingMessages);
    const freeTextMotivation =
      tappedMotivation === undefined && lacksBuyerMotivation(session.leadProfile.motivation)
        ? parseLeadMotivationFromPending(pendingTexts)
        : undefined;
    const adoptedMotivation = tappedMotivation ?? freeTextMotivation;
    const freeTextPayment =
      tappedCapture?.field !== 'paymentMethod' && session.leadProfile.paymentMethod === undefined
        ? parseLeadPaymentFromPending(pendingTexts)
        : undefined;
    const paymentProfilePatch: Partial<LeadProfile> =
      tappedCapture?.profilePatch?.paymentMethod !== undefined
        ? { paymentMethod: tappedCapture.profilePatch.paymentMethod }
        : freeTextPayment !== undefined
          ? { paymentMethod: freeTextPayment }
          : {};
    const isMotivationCaptureTurn =
      lacksBuyerMotivation(session.leadProfile.motivation) && adoptedMotivation !== undefined;
    const lotPreferencePatch =
      tappedLotArea !== undefined ? { lotPreference: `${tappedLotArea} m2` } : undefined;
    const profileForPrompt: LeadProfile = {
      ...session.leadProfile,
      ...(tappedCapture?.profilePatch ?? {}),
      ...paymentProfilePatch,
      ...(lotPreferencePatch ?? {}),
      ...(adoptedMotivation !== undefined ? { motivation: adoptedMotivation } : {}),
    };
    const isBooked =
      session.step === LeadConversationStep.Scheduled || session.status === 'scheduled';
    const captureContextRaw = await this.loadCaptureContext(
      session,
      resolved,
      profileForPrompt,
      formFields,
      isBooked,
    );
    const needsProjectGate = !hasConfirmedProjectGate(resolved);
    const needsMotivationGate = lacksBuyerMotivation(profileForPrompt.motivation);
    const captureContext = {
      ...captureContextRaw,
      nextCaptureField:
        needsProjectGate || needsMotivationGate ? undefined : captureContextRaw.nextCaptureField,
      missingCaptureFields:
        needsProjectGate || needsMotivationGate ? [] : captureContextRaw.missingCaptureFields,
    };
    const catalog = await this.knowledge.executeGetCatalogSummary();
    const customerText = pendingTexts.join('\n');
    const faqs = await this.faqResolver.executeResolve({
      projectId: resolved.projectId,
      ...(isMotivationCaptureTurn ? {} : { customerText }),
    });
    const promptSession = this.buildPromptSession(
      session,
      resolved,
      adoptedMotivation,
      { ...(tappedCapture?.profilePatch ?? {}), ...paymentProfilePatch, ...(lotPreferencePatch ?? {}) },
    );
    const canOfferCallForPrompt = isLeadQualifiedToOfferCall({
      projectId: resolved.projectId,
      motivation: profileForPrompt.motivation,
      step: session.step,
    });
    const nextCallTap = this.findPendingReplyId(input.pendingMessages, REPLY_ID.nextCall);
    const nextQuestionTap = this.findPendingReplyId(input.pendingMessages, REPLY_ID.nextQuestion);
    const adoptedPaymentThisTurn =
      tappedCapture?.field === 'paymentMethod' || freeTextPayment !== undefined;
    const forceAfterCash = this.guidedPath.shouldForceScheduleAfterCash({
      paymentMethod: profileForPrompt.paymentMethod,
      previousPaymentMethod: session.leadProfile.paymentMethod,
      adoptedCaptureField: adoptedPaymentThisTurn ? 'paymentMethod' : tappedCapture?.field,
      canOfferCall: canOfferCallForPrompt,
    });
    const forceAfterLot = tappedLotArea !== undefined && canOfferCallForPrompt;
    const financedWithoutPlans =
      adoptedPaymentThisTurn &&
      profileForPrompt.paymentMethod === 'financed' &&
      canOfferCallForPrompt &&
      settings.pricePolicy !== 'defer_to_advisor' &&
      this.resolveProjectFinancing(resolved.knowledge) === undefined;
    const financedDeferToAdvisor =
      adoptedPaymentThisTurn &&
      profileForPrompt.paymentMethod === 'financed' &&
      canOfferCallForPrompt &&
      settings.pricePolicy === 'defer_to_advisor';
    const forceOfferCallSlots =
      (nextCallTap && this.guidedPath.shouldForceOfferCallSlots(REPLY_ID.nextCall, canOfferCallForPrompt)) ||
      forceAfterCash ||
      forceAfterLot ||
      financedWithoutPlans ||
      financedDeferToAdvisor;
    const schedulePreface: OutboundMessagePlan[] = forceAfterLot
      ? [...this.transitions.buildLotChoiceAck(tappedLotArea!).outbound]
      : forceAfterCash
        ? [{ kind: 'text', body: LEAD_TEMPLATES.scheduleLeadCash }]
        : financedWithoutPlans
          ? [{ kind: 'text', body: LEAD_TEMPLATES.financingMissingFallback }]
          : financedDeferToAdvisor
            ? [{ kind: 'text', body: LEAD_TEMPLATES.scheduleLeadFinanced }]
            : [];
    const isFirstCustomerMessage = !input.history.some((message) => message.direction === 'inbound');
    const hasConfirmedProject = hasConfirmedProjectGate(resolved);
    /** Predefined greeting only when there is no confirmed project; AI greets when project is already defined. */
    const systemSendsGreeting = isFirstCustomerMessage && !hasConfirmedProject;
    const baseGreeting = interpolateTemplate(settings.greeting, {
      customerName: session.firstName,
      assistantName: settings.assistantName,
      businessName: settings.businessName,
    }).trim();
    const suggestedTitle = (resolved.suggestedProject?.title ?? '').trim();
    const greeting =
      systemSendsGreeting && suggestedTitle.length > 0
        ? `${baseGreeting}\n\n${interpolateTemplate(LEAD_TEMPLATES.greetingProjectConfirm, {
            project_name: suggestedTitle,
          })}`
        : baseGreeting;
    this.logger.log(
      `greetingGate customer=${customerKey} firstInbound=${isFirstCustomerMessage} ` +
        `hasConfirmedProject=${hasConfirmedProject} systemSendsGreeting=${systemSendsGreeting} ` +
        `softSuggestConfirm=${systemSendsGreeting && suggestedTitle.length > 0}`,
    );
    const messages = this.promptBuilder.buildMessages({
      assistantName: settings.assistantName,
      businessName: settings.businessName,
      greeting: settings.greeting,
      pricePolicy: settings.pricePolicy,
      session: promptSession,
      history: input.history,
      pendingMessages: input.pendingMessages,
      project: resolved.knowledge,
      ...(resolved.suggestedProject !== undefined && !hasConfirmedProject
        ? { suggestedProject: resolved.suggestedProject }
        : {}),
      catalog,
      faqs,
      captureKnown: captureContext.known as Record<string, string>,
      missingCaptureFields: captureContext.missingCaptureFields,
      ...(captureContext.nextCaptureField !== undefined
        ? { nextCaptureField: captureContext.nextCaptureField }
        : {}),
      systemSendsFinancing:
        settings.pricePolicy !== 'defer_to_advisor' &&
        this.resolveProjectFinancing(resolved.knowledge) !== undefined,
      systemSendsGreeting,
    });
    const turn = await this.llm.executeTurn(messages, {
      allowedProjectIds: new Set(catalog.map((item) => item.id)),
      allowedFaqIds: new Set(faqs.map((faq) => faq.id)),
    });
    const freeTextPaymentMetadata =
      freeTextPayment !== undefined
        ? { paymentMethod: freeTextPayment === 'cash' ? 'cash' : 'financing' }
        : undefined;
    const baseCapturePatch = this.buildBaseCapturePatch(
      resolved,
      formFields,
      profileForPrompt,
      { ...(tappedCapture?.metadataPatch ?? {}), ...(freeTextPaymentMetadata ?? {}) },
    );
    const captureProfilePatch: Partial<LeadProfile> = {
      ...(tappedCapture?.profilePatch ?? {}),
      ...paymentProfilePatch,
      ...(lotPreferencePatch ?? {}),
    };
    const adoptedPaymentField =
      tappedCapture?.field === 'paymentMethod' || freeTextPayment !== undefined
        ? 'paymentMethod'
        : tappedCapture?.field;
    if (turn === null) {
      this.logger.log(`llmTurn customer=${customerKey} result=null forceSlots=${forceOfferCallSlots === true}`);
      const fallback = await this.buildFallbackOutcome(
        session,
        resolved,
        input.pendingMessages,
        faqs,
        greeting,
        tappedMotivation,
        captureContext.nextCaptureField,
        adoptedPaymentField,
        captureProfilePatch,
        settings.pricePolicy,
        forceOfferCallSlots === true,
        nextQuestionTap === true,
        schedulePreface,
      );
      const patched = this.withCapturePatch(
        fallback,
        baseCapturePatch,
        fallback.transition.sessionPatch?.leadProfile,
      );
      this.logger.log(
        `outboundBeforeGreeting customer=${customerKey} plans=${JSON.stringify(previewOutbound(patched.transition.outbound))}`,
      );
      return this.withFirstGreeting(patched, systemSendsGreeting ? greeting : '');
    }
    this.logger.log(
      `llmTurn customer=${customerKey} action=${turn.action} projectId=${turn.projectId ?? 'null'} ` +
        `intents=${turn.intents.join(',') || 'none'} replies=${turn.replies.length}`,
    );
    const effectiveTurn: LeadAgentLlmTurn =
      forceOfferCallSlots === true
        ? {
            ...turn,
            action: 'offer_call_slots',
            intents: turn.intents.includes('wants_call')
              ? turn.intents
              : [...turn.intents, 'wants_call'],
          }
        : turn;
    const afterProject = await this.applyTurnProject(resolved, effectiveTurn, input.pendingMessages);
    const outcome = await this.buildTurnOutcome(
      session,
      afterProject,
      effectiveTurn,
      adoptedMotivation,
      isMotivationCaptureTurn,
      captureContext.nextCaptureField,
      adoptedPaymentField,
      captureProfilePatch,
      settings.pricePolicy,
      schedulePreface,
      systemSendsGreeting,
    );
    const patched = this.withCapturePatch(
      outcome,
      baseCapturePatch,
      outcome.transition.sessionPatch?.leadProfile,
    );
    this.logger.log(
      `outboundBeforeGreeting customer=${customerKey} plans=${JSON.stringify(previewOutbound(patched.transition.outbound))}`,
    );
    return this.withFirstGreeting(patched, systemSendsGreeting ? greeting : '');
  }

  /**
   * Sends the predefined greeting once when there is no confirmed project at turn start.
   * Drops AI free-text replies; keeps project teaser + interactives (greeting → teaser → motive).
   */
  private withFirstGreeting(outcome: LeadAgentTurnOutcome, greeting: string): LeadAgentTurnOutcome {
    const trimmed = greeting.trim();
    if (trimmed.length === 0) {
      this.logger.log(
        `withFirstGreeting skip prepend outbound=${JSON.stringify(previewOutbound(outcome.transition.outbound))}`,
      );
      return outcome;
    }
    const outbound = outcome.transition.outbound;
    const first = outbound[0];
    const keepAfterGreeting = (plans: readonly OutboundMessagePlan[]): OutboundMessagePlan[] =>
      plans.filter((plan) => plan.kind !== 'text' || isProjectTeaserPlan(plan));
    if (first?.kind === 'text' && first.body.trim() === trimmed) {
      const kept = keepAfterGreeting(outbound.slice(1));
      const droppedText = outbound.slice(1).length - kept.length;
      const nextOutbound = [first, ...kept];
      this.logger.log(
        `withFirstGreeting alreadyPresent droppedAiText=${droppedText} ` +
          `outbound=${JSON.stringify(previewOutbound(nextOutbound))}`,
      );
      return {
        ...outcome,
        transition: {
          ...outcome.transition,
          outbound: nextOutbound,
        },
      };
    }
    const kept = keepAfterGreeting(outbound);
    const droppedText = outbound.length - kept.length;
    const nextOutbound: OutboundMessagePlan[] = [{ kind: 'text', body: trimmed }, ...withReplyGap(kept)];
    this.logger.log(
      `withFirstGreeting prepended droppedAiText=${droppedText} ` +
        `outbound=${JSON.stringify(previewOutbound(nextOutbound))}`,
    );
    return {
      ...outcome,
      transition: {
        ...outcome.transition,
        outbound: nextOutbound,
      },
    };
  }

  /**
   * Interactive project tap first, then session project / isAllProjects,
   * else Instant Form adopt of the ad project, else soft ad suggestion.
   */
  private async resolveProject(
    session: LeadAgentSessionView,
    pendingMessages: readonly LeadAgentPendingMessage[],
    adoptSuggested = false,
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
    if (adoptSuggested) {
      const knowledge = await this.knowledge.executeGetById(adProject.id);
      return {
        projectId: adProject.id,
        projectTitle: adProject.title,
        isNewlyResolved: true,
        knowledge,
      };
    }
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
    captureProfilePatch?: Partial<LeadProfile>,
  ): LeadAgentSessionView {
    return {
      ...session,
      ...(resolved.projectId !== undefined
        ? { projectId: resolved.projectId, projectTitle: resolved.projectTitle }
        : {}),
      ...(resolved.isAllProjects === true ? { isAllProjects: true } : {}),
      leadProfile: {
        ...session.leadProfile,
        ...(captureProfilePatch ?? {}),
        ...(tappedMotivation !== undefined ? { motivation: tappedMotivation } : {}),
      },
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

  /** Adopts `lot:{area}` from the newest pending interactive reply. */
  private adoptLotAreaFromPending(pendingMessages: readonly LeadAgentPendingMessage[]): number | undefined {
    for (let index = pendingMessages.length - 1; index >= 0; index -= 1) {
      const replyId = pendingMessages[index]?.replyId;
      if (replyId === undefined || !replyId.startsWith(REPLY_ID.lotPrefix)) continue;
      const area = Number(replyId.slice(REPLY_ID.lotPrefix.length));
      if (Number.isFinite(area) && area > 0) return area;
    }
    return undefined;
  }

  private adoptCaptureFromPending(
    pendingMessages: readonly LeadAgentPendingMessage[],
  ): ReturnType<typeof adoptLeadCaptureFromReplyId> {
    for (let index = pendingMessages.length - 1; index >= 0; index -= 1) {
      const adopted = adoptLeadCaptureFromReplyId(pendingMessages[index]?.replyId);
      if (adopted !== undefined) return adopted;
    }
    return undefined;
  }

  private parseInstantFormFields(
    pendingMessages: readonly LeadAgentPendingMessage[],
  ): LeadFormFieldsFromText | undefined {
    const dump = pendingMessages.find((message) => message.isInstantFormDump === true);
    if (dump === undefined) return undefined;
    return extractFormFieldsFromLeadText(dump.text);
  }

  private async loadCaptureContext(
    session: LeadAgentSessionView,
    resolved: ResolvedLeadProject,
    profile: LeadProfile,
    formFields?: LeadFormFieldsFromText,
    isBooked = false,
  ): Promise<{
    readonly known: LeadCaptureKnown;
    readonly missingCaptureFields: LeadCaptureFieldKey[];
    readonly nextCaptureField?: LeadCaptureFieldKey;
  }> {
    const formKnown: LeadCaptureKnown = {
      ...(formFields?.city ? { city: formFields.city } : {}),
      ...(formFields?.economicCapacity ? { economicCapacity: formFields.economicCapacity } : {}),
      ...(resolved.projectId ? { projectId: resolved.projectId } : {}),
      ...(mapMotivationToBuyMotive(profile.motivation)
        ? { buyMotive: mapMotivationToBuyMotive(profile.motivation)! }
        : {}),
      ...(profile.timeline ? { timeToBuy: profile.timeline } : {}),
    };
    if (session.customerId === undefined) {
      const known = buildCaptureKnown({
        metadataValues: formKnown as Record<string, string>,
        profile,
        projectId: resolved.projectId,
      });
      const nextCaptureField = resolveNextCaptureField(known, isBooked);
      return {
        known,
        missingCaptureFields: listMissingCaptureFields(known, isBooked),
        ...(nextCaptureField !== undefined ? { nextCaptureField } : {}),
      };
    }
    const loaded = await this.captureSync.executeGetCaptureKnown({
      customerId: String(session.customerId),
      profile,
      projectId: resolved.projectId,
    });
    const known: LeadCaptureKnown = { ...loaded.known, ...formKnown };
    const nextCaptureField = resolveNextCaptureField(known, isBooked);
    return {
      known,
      missingCaptureFields: listMissingCaptureFields(known, isBooked),
      ...(nextCaptureField !== undefined ? { nextCaptureField } : {}),
    };
  }

  private findPendingReplyId(
    pendingMessages: readonly LeadAgentPendingMessage[],
    replyId: string,
  ): boolean {
    for (let index = pendingMessages.length - 1; index >= 0; index -= 1) {
      if (pendingMessages[index]?.replyId === replyId) return true;
    }
    return false;
  }

  /**
   * Drops LLM-invented motivation or payment when the customer did not choose them
   * this turn — otherwise the matching buttons are skipped.
   */
  private sanitizeTurnProfile(
    session: LeadAgentSessionView,
    turnProfile: LeadProfile,
    adoptedMotivation?: NonNullable<LeadProfile['motivation']>,
    adoptedPayment = false,
  ): LeadProfile {
    let profile: LeadProfile = turnProfile;
    if (
      adoptedMotivation === undefined &&
      lacksBuyerMotivation(session.leadProfile.motivation) &&
      profile.motivation !== undefined
    ) {
      const { motivation: _ignoredMotivation, ...rest } = profile;
      profile = rest;
    }
    if (!adoptedPayment && session.leadProfile.paymentMethod === undefined && profile.paymentMethod !== undefined) {
      const { paymentMethod: _ignoredPayment, ...rest } = profile;
      profile = rest;
    }
    return profile;
  }

  private buildBaseCapturePatch(
    resolved: ResolvedLeadProject,
    formFields: LeadFormFieldsFromText | undefined,
    profile: LeadProfile,
    tapMetadata?: Record<string, string>,
  ): Record<string, string> {
    return {
      ...this.captureSync.buildPatchFromProfileAndForm({
        profile,
        projectId: resolved.projectId,
        form: formFields,
      }),
      ...(tapMetadata ?? {}),
    };
  }

  private withCapturePatch(
    outcome: LeadAgentTurnOutcome,
    basePatch: Record<string, string>,
    leadProfile?: LeadProfile,
  ): LeadAgentTurnOutcome {
    const fromProfile =
      leadProfile !== undefined
        ? this.captureSync.buildPatchFromProfileAndForm({
            profile: leadProfile,
            projectId: outcome.transition.sessionPatch?.projectId,
          })
        : {};
    const capturePatch = { ...basePatch, ...fromProfile };
    if (Object.keys(capturePatch).length === 0) return outcome;
    return { ...outcome, capturePatch };
  }

  /**
   * Adopts or switches to the project the LLM picked from the catalog; unknown ids are dropped.
   * Soft-suggested campaign projects are NOT confirmed until the customer affirms (or taps).
   */
  private async applyTurnProject(
    resolved: ResolvedLeadProject,
    turn: LeadAgentLlmTurn,
    pendingMessages: readonly LeadAgentPendingMessage[],
  ): Promise<ResolvedLeadProject> {
    if (turn.projectId === null) {
      this.logger.log('applyTurnProject decision=unchanged reason=llm_project_null');
      return resolved;
    }
    if (resolved.projectId === turn.projectId) {
      this.logger.log(`applyTurnProject decision=unchanged reason=same_id id=${turn.projectId}`);
      return resolved;
    }
    if (
      resolved.projectId === undefined &&
      resolved.suggestedProject !== undefined &&
      turn.projectId === resolved.suggestedProject.id &&
      !this.customerAffirmsSuggestedProject(pendingMessages, resolved.suggestedProject)
    ) {
      this.logger.log(
        `applyTurnProject decision=rejected_unconfirmed_suggest id=${turn.projectId} ` +
          `title=${resolved.suggestedProject.title}`,
      );
      return resolved;
    }
    const knowledge = await this.knowledge.executeGetById(turn.projectId);
    if (knowledge === undefined) {
      this.logger.log(`applyTurnProject decision=unchanged reason=unknown_id id=${turn.projectId}`);
      return resolved;
    }
    this.logger.log(
      `applyTurnProject decision=${resolved.projectId !== undefined ? 'switched' : 'accepted'} ` +
        `from=${resolved.projectId ?? 'none'} to=${knowledge.id} title=${knowledge.title}`,
    );
    return {
      projectId: knowledge.id,
      projectTitle: knowledge.title,
      isNewlyResolved: true,
      isAllProjects: false,
      knowledge,
      ...(resolved.adoptedFromTap === true ? { adoptedFromTap: true } : {}),
    };
  }

  /** True when pending text clearly accepts the soft-suggested project. */
  private customerAffirmsSuggestedProject(
    pendingMessages: readonly LeadAgentPendingMessage[],
    suggested: { readonly id: string; readonly title: string },
  ): boolean {
    const joined = pendingMessages
      .map((message) => message.text)
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (joined.length === 0) return false;
    const title = suggested.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (title.length > 0 && joined.includes(title)) return true;
    const affirmations = ['si', 'sí', 'ese', 'esa', 'claro', 'correcto', 'exacto', 'dale', 'ok', 'okay', 'de acuerdo'];
    const isShortAffirmation =
      pendingMessages.length === 1 &&
      affirmations.some((word) => {
        const text = pendingMessages[0]?.text
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .replace(/[^a-z0-9\s]/g, ' ')
          .trim();
        return text === word || text === `${word} gracias`;
      });
    return isShortAffirmation;
  }

  private async buildFallbackOutcome(
    session: LeadAgentSessionView,
    resolved: ResolvedLeadProject,
    pendingMessages: readonly LeadAgentPendingMessage[],
    faqs: readonly LeadResolvedFaq[],
    greeting: string,
    tappedMotivation?: NonNullable<LeadProfile['motivation']>,
    nextCaptureField?: LeadCaptureFieldKey,
    adoptedCaptureField?: string,
    captureProfilePatch?: Partial<LeadProfile>,
    pricePolicy: LeadPricePolicy = 'entry_ticket_first',
    forceOfferCallSlots = false,
    nextQuestionTap = false,
    schedulePreface: readonly OutboundMessagePlan[] = [],
  ): Promise<LeadAgentTurnOutcome> {
    const profile = {
      ...this.mergeFallbackMotivation(session, pendingMessages, tappedMotivation),
      ...(captureProfilePatch ?? {}),
    };
    const signals = this.scoring.deriveSignals(profile, [], session.scoreSignals);
    if (forceOfferCallSlots) {
      const askSchedule = this.transitions.buildAskSchedule(profile.paymentMethod);
      return {
        transition: this.buildTransition(session, resolved, {
          outbound: [...schedulePreface, ...withReplyGap(askSchedule.outbound)],
          nextStep: LeadConversationStep.AskSchedule,
          status: this.resolveStatus(session),
          profile,
          signals: [...new Set([...signals, 'accepted_call'])],
          intents: ['wants_call'],
          action: 'offer_call_slots',
          isOptOut: false,
        }),
        usedFaqIds: [],
      };
    }
    if (nextQuestionTap) {
      return {
        transition: this.buildTransition(
          session,
          resolved,
          this.buildContinueFallbackDraft(session, LEAD_TEMPLATES.askYourQuestion, profile, signals),
        ),
        usedFaqIds: [],
      };
    }
    const newlyCapturedBuyerMotivation =
      lacksBuyerMotivation(session.leadProfile.motivation) && isBuyerMotivation(profile.motivation);
    const customerText = pendingMessages.map((message) => message.text).join('\n');
    const bestFaq = newlyCapturedBuyerMotivation
      ? undefined
      : pickBestLeadFaqMatch(customerText, faqs);
    if (bestFaq !== undefined) {
      const draft = this.buildContinueFallbackDraft(session, bestFaq.faq.answer, profile, signals);
      const guided = this.appendGuidedPathOutbound({
        session,
        resolved,
        profile,
        previousPaymentMethod: session.leadProfile.paymentMethod,
        action: 'continue',
        intents: [],
        usedFaqIds: [bestFaq.faq.id],
        pricePolicy,
        adoptedCaptureField,
        preceding: draft.outbound,
      });
      return {
        transition: this.buildTransition(session, resolved, {
          ...draft,
          outbound: guided,
        }),
        usedFaqIds: [bestFaq.faq.id],
      };
    }
    if (!hasConfirmedProjectGate(resolved)) {
      const greetingOutbound: OutboundMessagePlan[] =
        greeting.length > 0 ? [{ kind: 'text', body: greeting }] : [];
      if (resolved.suggestedProject !== undefined) {
        return {
          transition: this.buildTransition(session, resolved, {
            outbound: greetingOutbound,
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
      const picker = await this.transitions.buildProjectPicker();
      return {
        transition: this.buildTransition(session, resolved, {
          outbound: [...greetingOutbound, ...withReplyGap(picker.outbound)],
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
          tappedMotivation !== undefined,
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
      const projectTeaser = this.buildProjectTeaserOutbound(resolved);
      const motivationOutbound = this.buildMotivationButtonsOutbound(
        resolved,
        profile,
        tappedMotivation !== undefined,
        projectTeaser.length > 0,
        LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY,
      );
      return {
        transition: this.buildTransition(session, resolved, {
          outbound: [...projectTeaser, ...motivationOutbound],
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
    if (SLOT_CHOICE_STEPS.includes(session.step)) {
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
    const draft = this.buildContinueFallbackDraft(
      session,
      LEAD_AGENT_FALLBACK_BUYER_CONTINUE_REPLY,
      profile,
      signals,
    );
    const guided = this.appendGuidedPathOutbound({
      session,
      resolved,
      profile,
      previousPaymentMethod: session.leadProfile.paymentMethod,
      action: 'continue',
      intents: [],
      usedFaqIds: [],
      pricePolicy,
      adoptedCaptureField,
      preceding: draft.outbound,
      nextCaptureField,
    });
    return {
      transition: this.buildTransition(session, resolved, {
        ...draft,
        outbound: guided,
      }),
      usedFaqIds: [],
    };
  }

  /**
   * Adopts motivation from a tap, else parses inbound text when the profile still
   * lacks a buyer motivation (missing or exploring).
   */
  private mergeFallbackMotivation(
    session: LeadAgentSessionView,
    pendingMessages: readonly LeadAgentPendingMessage[],
    tappedMotivation?: NonNullable<LeadProfile['motivation']>,
  ): LeadProfile {
    if (tappedMotivation !== undefined) return { ...session.leadProfile, motivation: tappedMotivation };
    if (!lacksBuyerMotivation(session.leadProfile.motivation)) return session.leadProfile;
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
    adoptedMotivation?: NonNullable<LeadProfile['motivation']>,
    adoptedMotivationThisTurn = false,
    nextCaptureField?: LeadCaptureFieldKey,
    adoptedCaptureField?: string,
    captureProfilePatch?: Partial<LeadProfile>,
    pricePolicy: LeadPricePolicy = 'entry_ticket_first',
    schedulePreface: readonly OutboundMessagePlan[] = [],
    systemSendsGreeting = false,
  ): Promise<LeadAgentTurnOutcome> {
    const profile: LeadProfile = {
      ...session.leadProfile,
      ...this.sanitizeTurnProfile(
        session,
        turn.profile,
        adoptedMotivation,
        adoptedCaptureField === 'paymentMethod',
      ),
      ...(captureProfilePatch ?? {}),
      ...(adoptedMotivation !== undefined ? { motivation: adoptedMotivation } : {}),
    };
    const signals = this.scoring.deriveSignals(profile, turn.intents, session.scoreSignals);
    const draft =
      turn.action === 'opt_out'
        ? this.buildOptOutDraft(profile, signals, turn)
        : await this.buildContinueDraft(
            session,
            resolved,
            profile,
            signals,
            turn,
            adoptedMotivationThisTurn,
            nextCaptureField,
            adoptedCaptureField,
            pricePolicy,
            schedulePreface,
            systemSendsGreeting,
          );
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
    adoptedMotivationThisTurn = false,
    nextCaptureField?: LeadCaptureFieldKey,
    adoptedCaptureField?: string,
    pricePolicy: LeadPricePolicy = 'entry_ticket_first',
    schedulePreface: readonly OutboundMessagePlan[] = [],
    systemSendsGreeting = false,
  ): Promise<LeadAgentTurnDraft> {
    const action = this.coerceAction(session, resolved, profile, turn);
    const isOfferingSlots = action === 'offer_call_slots';
    const media = this.buildMedia(resolved, profile, { ...turn, action });
    const slots = isOfferingSlots ? await this.buildSlotTransition(session, turn) : undefined;
    const pickerOutbound = await this.buildProjectPickerOutbound(resolved, action);
    const replyPlans =
      systemSendsGreeting && !hasConfirmedProjectGate(resolved) ? [] : this.buildReplyPlans(turn.replies);
    const preceding: OutboundMessagePlan[] = [
      ...(schedulePreface.length > 0 ? schedulePreface : replyPlans),
      ...media.plans,
      ...withReplyGap(slots?.outbound ?? []),
    ];
    if (pickerOutbound.length > 0) {
      return {
        outbound: [...preceding, ...pickerOutbound],
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
    const projectTeaser = this.buildProjectTeaserOutbound(resolved);
    const motivationOutbound = this.buildMotivationButtonsOutbound(
      resolved,
      profile,
      adoptedMotivationThisTurn,
      projectTeaser.length > 0,
    );
    if (motivationOutbound.length > 0) {
      return {
        outbound: [...projectTeaser, ...motivationOutbound],
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
    const outbound = this.appendGuidedPathOutbound({
      session,
      resolved,
      profile,
      previousPaymentMethod: session.leadProfile.paymentMethod,
      action,
      intents: turn.intents,
      usedFaqIds: turn.usedFaqIds,
      unansweredQuestion: turn.unansweredQuestion ?? undefined,
      pricePolicy,
      adoptedCaptureField,
      preceding,
      nextCaptureField:
        action === 'continue' &&
        !isOfferingSlots &&
        media.plans.length === 0 &&
        turn.usedFaqIds.length === 0
          ? nextCaptureField
          : undefined,
    });
    return {
      outbound,
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

  /**
   * Appends financing offer, cash ack, next-step buttons and/or the next capture interactive.
   * Next-step buttons win over payment capture when financing/cash/FAQ/unanswered already fired.
   */
  private appendGuidedPathOutbound(args: {
    readonly session: LeadAgentSessionView;
    readonly resolved: ResolvedLeadProject;
    readonly profile: LeadProfile;
    readonly previousPaymentMethod?: LeadProfile['paymentMethod'];
    readonly action: LeadAgentLlmTurn['action'];
    readonly intents: readonly LeadAgentLlmTurn['intents'][number][];
    readonly usedFaqIds: readonly string[];
    readonly unansweredQuestion?: string;
    readonly pricePolicy: LeadPricePolicy;
    readonly adoptedCaptureField?: string;
    readonly preceding: readonly OutboundMessagePlan[];
    readonly nextCaptureField?: LeadCaptureFieldKey;
  }): OutboundMessagePlan[] {
    const isBooked =
      args.session.step === LeadConversationStep.Scheduled || args.session.status === 'scheduled';
    const canOfferCall = isLeadQualifiedToOfferCall({
      projectId: args.resolved.projectId,
      motivation: args.profile.motivation,
      step: args.session.step,
    });
    const paymentButtons = this.buildPaymentButtonsIfMissing(args);
    if (paymentButtons.length > 0) return paymentButtons;
    const financingPicker = this.buildFinancingLotPickerIfMissing(args);
    if (financingPicker.length > 0) return financingPicker;
    const guided = this.guidedPath.buildOutbound({
      project: args.resolved.knowledge,
      pricePolicy: args.pricePolicy,
      profile: args.profile,
      previousPaymentMethod: args.previousPaymentMethod,
      action: args.action,
      intents: args.intents,
      usedFaqIds: args.usedFaqIds,
      unansweredQuestion: args.unansweredQuestion,
      canOfferCall,
      isOnSlotStep: SLOT_CHOICE_STEPS.includes(args.session.step),
      isBooked,
      hasConfirmedProject: hasConfirmedProjectGate(args.resolved),
      adoptedCaptureField: args.adoptedCaptureField,
      hasPrecedingText: args.preceding.length > 0,
    });
    const financingIsInteractive = guided.financing.some(
      (plan) => plan.kind === 'buttons' || plan.kind === 'list',
    );
    if (financingIsInteractive || guided.sentFinancing) {
      return [...guided.financing];
    }
    const guidedPlans = [...guided.cashAck, ...guided.nextStep];
    if (guidedPlans.length > 0) {
      return [...args.preceding, ...guidedPlans];
    }
    const skipCaptureForKnowledgeTurn =
      args.usedFaqIds.length > 0 || (args.unansweredQuestion ?? '').trim().length > 0;
    if (skipCaptureForKnowledgeTurn) {
      return [...args.preceding];
    }
    const captureOutbound = this.buildCaptureFieldOutbound(
      args.nextCaptureField,
      args.adoptedCaptureField,
      args.preceding.length > 0,
    );
    return [...args.preceding, ...captureOutbound];
  }

  /**
   * After motive is known, payment is always the Financiado / De contado buttons.
   * Ignores stale metadata and LLM prose so the buttons cannot be skipped.
   */
  private buildPaymentButtonsIfMissing(args: {
    readonly session: LeadAgentSessionView;
    readonly resolved: ResolvedLeadProject;
    readonly profile: LeadProfile;
    readonly action: LeadAgentLlmTurn['action'];
    readonly adoptedCaptureField?: string;
    readonly preceding: readonly OutboundMessagePlan[];
  }): OutboundMessagePlan[] {
    if (args.action !== 'continue') return [];
    if (SLOT_CHOICE_STEPS.includes(args.session.step)) return [];
    if (args.session.step === LeadConversationStep.Scheduled || args.session.status === 'scheduled') {
      return [];
    }
    if (!hasConfirmedProjectGate(args.resolved)) return [];
    if (!isBuyerMotivation(args.profile.motivation)) return [];
    if (args.session.leadProfile.paymentMethod !== undefined) return [];
    if (args.adoptedCaptureField === 'paymentMethod') return [];
    if (args.profile.paymentMethod !== undefined) return [];
    if (args.preceding.some((plan) => plan.kind !== 'text')) return [];
    return this.buildCaptureFieldOutbound('paymentMethod', undefined, false);
  }

  /**
   * After Financiado, always send the monthly lot picker (or a short fallback).
   * Drops LLM prose so the customer never only sees "Excelente, la financiación…".
   */
  private buildFinancingLotPickerIfMissing(args: {
    readonly session: LeadAgentSessionView;
    readonly resolved: ResolvedLeadProject;
    readonly profile: LeadProfile;
    readonly action: LeadAgentLlmTurn['action'];
    readonly pricePolicy: LeadPricePolicy;
    readonly intents: readonly LeadAgentLlmTurn['intents'][number][];
  }): OutboundMessagePlan[] {
    if (args.action !== 'continue') return [];
    if (SLOT_CHOICE_STEPS.includes(args.session.step)) return [];
    if (args.session.step === LeadConversationStep.Scheduled || args.session.status === 'scheduled') {
      return [];
    }
    if (!hasConfirmedProjectGate(args.resolved)) return [];
    if (args.profile.lotPreference !== undefined) return [];
    if (args.pricePolicy === 'defer_to_advisor') {
      this.logger.log('financingPicker skip reason=defer_to_advisor');
      return [];
    }
    const wantsFinancing =
      args.profile.paymentMethod === 'financed' ||
      args.intents.includes('asked_price') ||
      args.intents.includes('asked_financing');
    if (!wantsFinancing) return [];
    const project = args.resolved.knowledge;
    const financing = this.resolveProjectFinancing(project);
    if (project !== undefined && financing !== undefined) {
      this.logger.log(
        `financingPicker send plans=${financing.plans.length} project=${project.id} ` +
          `payment=${args.profile.paymentMethod ?? 'none'}`,
      );
      return [
        ...this.transitions.buildFinancingLotPicker({
          ...project,
          financing,
        }).outbound,
      ];
    }
    this.logger.log(
      `financingPicker fallback missingPlans project=${project?.id ?? 'none'} ` +
        `lots=${project?.lotOptions?.length ?? 0}`,
    );
    return [{ kind: 'text', body: LEAD_TEMPLATES.financingMissingFallback }];
  }

  /** Uses precomputed financing or rebuilds it from lot options. */
  private resolveProjectFinancing(
    project: ProjectKnowledge | undefined,
  ): ProjectKnowledge['financing'] | undefined {
    if (project === undefined) return undefined;
    if (project.financing !== undefined && project.financing.plans.length > 0) {
      return project.financing;
    }
    return buildProjectFinancing({
      lotOptions: project.lotOptions,
      separation: project.financing?.separation,
      maxInstallments: project.financing?.installments,
    });
  }

  /**
   * Appends the project selector only when there is no confirmed project and no soft suggestion,
   * or when the model explicitly asks to resend it (`offer_projects`).
   */
  private async buildProjectPickerOutbound(
    resolved: ResolvedLeadProject,
    action: LeadAgentLlmTurn['action'],
  ): Promise<OutboundMessagePlan[]> {
    if (resolved.adoptedFromTap === true) return [];
    if (action === 'offer_projects') {
      const picker = await this.transitions.buildProjectPicker();
      return withReplyGap(picker.outbound);
    }
    if (hasConfirmedProjectGate(resolved)) return [];
    if (resolved.suggestedProject !== undefined) return [];
    const picker = await this.transitions.buildProjectPicker();
    return withReplyGap(picker.outbound);
  }

  /**
   * Deterministic project teaser from omega_rag `shortDescription` when the project
   * was just confirmed this turn (tap or Instant Form / LLM adopt).
   */
  private buildProjectTeaserOutbound(resolved: ResolvedLeadProject): OutboundMessagePlan[] {
    if (resolved.isNewlyResolved !== true) return [];
    const knowledge = resolved.knowledge;
    if (knowledge === undefined) return [];
    return [...this.transitions.buildProjectTeaser(knowledge).outbound];
  }

  /**
   * Appends motivation reply buttons when the project gate is open and motivation is still unknown or exploring.
   * Short body when text already precedes; full ask when buttons are the sole outbound.
   */
  private buildMotivationButtonsOutbound(
    resolved: ResolvedLeadProject,
    profile: LeadProfile,
    adoptedMotivationThisTurn: boolean,
    hasPrecedingText: boolean,
    soleAskBody: string = LEAD_TEMPLATES.askMotivationPicker,
  ): OutboundMessagePlan[] {
    if (!hasConfirmedProjectGate(resolved)) return [];
    if (!needsMotivationButtons(profile, adoptedMotivationThisTurn)) return [];
    const body = hasPrecedingText ? LEAD_TEMPLATES.askMotivationChoice : soleAskBody;
    const plans = this.transitions.buildAskMotivation(body).outbound;
    return hasPrecedingText ? withReplyGap(plans) : [...plans];
  }

  /** One interactive capture field per turn (time / payment / urgency / decision). */
  private buildCaptureFieldOutbound(
    nextCaptureField: LeadCaptureFieldKey | undefined,
    adoptedCaptureField: string | undefined,
    hasPrecedingText: boolean,
  ): OutboundMessagePlan[] {
    if (nextCaptureField === undefined) return [];
    if (adoptedCaptureField === nextCaptureField) return [];
    if (
      nextCaptureField !== 'timeToBuy' &&
      nextCaptureField !== 'paymentMethod' &&
      nextCaptureField !== 'urgencyLevel' &&
      nextCaptureField !== 'decisionMaker'
    ) {
      return [];
    }
    const bodyByField: Record<string, { full: string; short: string }> = {
      timeToBuy: {
        full: LEAD_TEMPLATES.askTimeToBuyPicker,
        short: LEAD_TEMPLATES.askTimeToBuyChoice,
      },
      paymentMethod: {
        full: LEAD_TEMPLATES.askPaymentCapturePicker,
        short: LEAD_TEMPLATES.askPaymentCaptureChoice,
      },
      urgencyLevel: {
        full: LEAD_TEMPLATES.askUrgencyPicker,
        short: LEAD_TEMPLATES.askUrgencyChoice,
      },
      decisionMaker: {
        full: LEAD_TEMPLATES.askDecisionMakerPicker,
        short: LEAD_TEMPLATES.askDecisionMakerChoice,
      },
    };
    const copy = bodyByField[nextCaptureField];
    if (copy === undefined) return [];
    const body = hasPrecedingText ? copy.short : copy.full;
    const transition =
      nextCaptureField === 'timeToBuy'
        ? this.transitions.buildAskTimeToBuy(body)
        : nextCaptureField === 'paymentMethod'
          ? this.transitions.buildAskPaymentCapture(body)
          : nextCaptureField === 'urgencyLevel'
            ? this.transitions.buildAskUrgency(body)
            : this.transitions.buildAskDecisionMaker(body);
    return hasPrecedingText ? withReplyGap(transition.outbound) : [...transition.outbound];
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
