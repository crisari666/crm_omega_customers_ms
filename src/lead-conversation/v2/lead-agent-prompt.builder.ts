import { Injectable } from '@nestjs/common';
import type { LeadPricePolicy } from '../../lead-assistant/types/lead-price-policy.type';
import { LEAD_AGENT_HISTORY_LIMIT } from '../constants/lead-conversation.constants';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import { interpolateTemplate } from '../utils/interpolate-template.util';
import { LEAD_AGENT_PROJECT_DESCRIPTION_MAX_CHARS } from './constants/lead-agent.constants';
import { resolveLeadAgentStageGoal } from './prompts/lead-agent-stage-goals';
import { buildLeadAgentSystemPrompt } from './prompts/lead-agent-system.prompt';
import type { LeadAgentChatMessage } from './types/lead-agent-chat-message.type';
import type { LeadAgentPromptInput } from './types/lead-agent-prompt-input.type';
import type { ProjectKnowledge } from './types/project-knowledge.type';
import { isLeadQualifiedToOfferCall } from './utils/lead-agent-can-offer-call.util';

const SLOT_CHOICE_STEPS: readonly LeadConversationStep[] = [
  LeadConversationStep.AskSchedule,
  LeadConversationStep.AskCallSlot,
];

/**
 * Builds the chat messages of one V2 agent turn:
 * system prompt, context JSON, transcript history and the pending customer messages.
 */
@Injectable()
export class LeadAgentPromptBuilder {
  /** Messages in order: system prompt, system context, history, pending customer text. */
  buildMessages(input: LeadAgentPromptInput): LeadAgentChatMessage[] {
    const systemPrompt = buildLeadAgentSystemPrompt({
      assistantName: input.assistantName,
      businessName: input.businessName,
    });
    const history = input.history
      .slice(-LEAD_AGENT_HISTORY_LIMIT)
      .map((message): LeadAgentChatMessage => ({
        role: message.direction === 'inbound' ? 'user' : 'assistant',
        content: message.body,
      }));
    const pendingText = input.pendingMessages.map((message) => message.text).join('\n');
    return [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: JSON.stringify(this.buildContext(input)) },
      ...history,
      ...(pendingText.length > 0 ? [{ role: 'user' as const, content: pendingText }] : []),
    ];
  }

  private buildContext(input: LeadAgentPromptInput): Record<string, unknown> {
    const { session } = input;
    const stage = session.leadProfile.stage ?? 'opening';
    const projectId = session.projectId ?? input.project?.id;
    const needsProject = projectId === undefined && session.isAllProjects !== true;
    const suggestedProject = needsProject ? input.suggestedProject : undefined;
    const hasSuggestedProject = suggestedProject !== undefined;
    const motivation = session.leadProfile.motivation;
    const needsMotivation = !needsProject && (motivation === undefined || motivation === 'exploring');
    const nextCaptureField = needsProject || needsMotivation ? undefined : input.nextCaptureField;
    const needsTimeToBuy = nextCaptureField === 'timeToBuy';
    const canOfferCall = isLeadQualifiedToOfferCall({
      projectId,
      motivation,
      step: session.step,
    });
    return {
      stage,
      stageGoal: resolveLeadAgentStageGoal(stage, !needsProject, hasSuggestedProject),
      needsProject,
      needsMotivation,
      needsTimeToBuy,
      ...(nextCaptureField !== undefined ? { nextCaptureField } : {}),
      ...(input.missingCaptureFields !== undefined
        ? { missingCaptureFields: input.missingCaptureFields }
        : {}),
      ...(input.captureKnown !== undefined ? { captureKnown: input.captureKnown } : {}),
      canOfferCall,
      profile: session.leadProfile,
      pricePolicy: input.pricePolicy,
      systemSendsFinancing: input.systemSendsFinancing === true,
      systemSendsGreeting: input.systemSendsGreeting === true,
      greeting: this.buildGreeting(input),
      ...(input.project !== undefined
        ? { project: this.buildProjectContext(input.project, input.pricePolicy, input.systemSendsFinancing === true) }
        : {}),
      ...(suggestedProject !== undefined
        ? {
            suggestedProject: {
              id: suggestedProject.id,
              title: suggestedProject.title,
            },
          }
        : {}),
      ...(input.catalog.length > 0 ? { catalog: input.catalog } : {}),
      faqs: input.faqs.map((faq) => ({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        alternativePhrasings: faq.alternativePhrasings,
      })),
      isWaitingForSlotChoice: SLOT_CHOICE_STEPS.includes(session.step),
      isAfterBooking: session.step === LeadConversationStep.Scheduled || session.status === 'scheduled',
      isFirstMessageFormDump: input.pendingMessages.some((message) => message.isInstantFormDump === true),
    };
  }

  private buildGreeting(input: LeadAgentPromptInput): string {
    return interpolateTemplate(input.greeting, {
      customerName: input.session.firstName,
      assistantName: input.assistantName,
      businessName: input.businessName,
    });
  }

  /**
   * Explicit whitelist: nothing outside it (commission, ventor, holders) can reach the prompt.
   * Under entry_ticket_first with financing, lot totals are hidden so the model cannot invent prices.
   */
  private buildProjectContext(
    project: ProjectKnowledge,
    pricePolicy: LeadPricePolicy,
    systemSendsFinancing: boolean,
  ): Record<string, unknown> {
    const hideTotals = systemSendsFinancing && pricePolicy === 'entry_ticket_first';
    return {
      id: project.id,
      title: project.title,
      shortDescription: project.shortDescription,
      description: project.description.slice(0, LEAD_AGENT_PROJECT_DESCRIPTION_MAX_CHARS),
      location: project.location,
      city: project.city,
      state: project.state,
      ...(hideTotals ? {} : { priceSell: project.priceSell }),
      lotOptions: hideTotals
        ? project.lotOptions.map((lot) => ({ area: lot.area }))
        : project.lotOptions,
      ...(project.financing !== undefined
        ? {
            financing: {
              separation: project.financing.separation,
              installments: project.financing.installments,
              minMonthlyPayment: project.financing.minMonthlyPayment,
              plans: project.financing.plans.map((plan) => ({
                area: plan.area,
                monthlyPayment: plan.monthlyPayment,
                ...(hideTotals ? {} : { price: plan.price }),
              })),
            },
          }
        : {}),
      amenitiesGroups: project.amenitiesGroups,
      lotCounts: project.lotCounts,
      availableMedia: {
        video: project.videoUrl !== undefined,
        plan: project.planeUrl !== undefined,
        brochure: project.brochureUrl !== undefined,
      },
    };
  }
}
