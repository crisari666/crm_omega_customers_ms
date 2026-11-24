import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SLOT_LABELS } from './constants/answer-mappings.constants';
import type { VentorAssignmentCandidate } from '../customer/types/ventor-assignment-candidate.type';
import {
  MAX_REPLY_BUTTONS,
  PAUSE_BEFORE_LOT_RANGES_MS,
  PAUSE_BEFORE_PLAN_MS,
  PAUSE_BEFORE_VENTOR_CONTACT_MS,
  REPLY_ID,
} from './constants/lead-conversation.constants';
import { ProjectCatalogService } from './project-catalog.service';
import { LEAD_TEMPLATES, PROJECT_LIST_EMOJIS } from './templates/lead-conversation.templates';
import type { LeadCallPeriod } from './types/lead-call-period.type';
import type { LeadCallSlot } from './types/lead-call-slot.type';
import type { LeadPaymentMethod } from './types/lead-conversation-answers.type';
import type { LeadProject, LeadProjectLotOption } from './types/lead-project.type';
import type { OutboundMessagePlan, OutboundOption } from './types/outbound-message-plan.type';
import type { ProjectKnowledge } from './v2/types/project-knowledge.type';
import { buildCallSlotOption } from './utils/build-call-slot-option.util';
import {
  buildLeadVentorContact,
  formatLeadVentorDisplayName,
} from './utils/build-lead-ventor-contact-plan.util';
import { formatCallSlotDate } from './utils/format-call-slot-date.util';
import { formatCop } from './utils/format-cop.util';
import { interpolateTemplate } from './utils/interpolate-template.util';

const PDF_EXTENSION_REGEX = /\.pdf$/i;

const PERIOD_OPTIONS: readonly OutboundOption[] = [
  { id: REPLY_ID.slotMorning, title: SLOT_LABELS.morning },
  { id: REPLY_ID.slotAfternoon, title: SLOT_LABELS.afternoon },
  { id: REPLY_ID.slotNight, title: SLOT_LABELS.night },
];

/** Builds the WhatsApp messages of each conversation step from {@link LEAD_TEMPLATES}. */
@Injectable()
export class LeadMessageComposerService {
  private readonly logger = new Logger(LeadMessageComposerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly projectCatalog: ProjectCatalogService,
  ) {}

  /** Welcome + project list ("Me interesan todos" appended). */
  async composeAskProject(firstName: string): Promise<OutboundMessagePlan[]> {
    const options = await this.buildProjectPickerOptions();
    const body = this.render(LEAD_TEMPLATES.askProject, firstName);
    return [this.buildChoiceMessage(body, options, LEAD_TEMPLATES.askProjectListButton)];
  }

  /**
   * Short project picker for V2 (same option ids as V1).
   * Default body avoids re-sending the full welcome mid-chat.
   */
  async composeProjectPicker(body: string = LEAD_TEMPLATES.askProjectPicker): Promise<OutboundMessagePlan[]> {
    const options = await this.buildProjectPickerOptions();
    return [this.buildChoiceMessage(body, options, LEAD_TEMPLATES.askProjectListButton)];
  }

  /** V2 motivation reply buttons (construir / inversión / explorando). */
  composeAskMotivation(body: string = LEAD_TEMPLATES.askMotivationPicker): OutboundMessagePlan[] {
    const options: OutboundOption[] = [
      { id: REPLY_ID.motivationBuild, title: LEAD_TEMPLATES.motivationBuildOption },
      { id: REPLY_ID.motivationInvest, title: LEAD_TEMPLATES.motivationInvestOption },
      { id: REPLY_ID.motivationExploring, title: LEAD_TEMPLATES.motivationExploringOption },
    ];
    return [this.buildChoiceMessage(body, options)];
  }

  /** Short attractive project teaser from omega_rag `shortDescription` (V2, after project pick). */
  composeProjectTeaser(project: Pick<ProjectKnowledge, 'title' | 'shortDescription'>): OutboundMessagePlan[] {
    const shortDescription = project.shortDescription.trim();
    const body =
      shortDescription.length > 0
        ? interpolateTemplate(LEAD_TEMPLATES.projectTeaserV2, {
            project_name: project.title,
            project_short_description: shortDescription,
          })
        : interpolateTemplate(LEAD_TEMPLATES.projectTeaserV2NameOnly, {
            project_name: project.title,
          });
    return [{ kind: 'text', body }];
  }

  /** V2 time-to-buy list (5 rows). */
  composeAskTimeToBuy(body: string = LEAD_TEMPLATES.askTimeToBuyPicker): OutboundMessagePlan[] {
    const options: OutboundOption[] = [
      { id: REPLY_ID.timeImmediate, title: LEAD_TEMPLATES.timeImmediateOption },
      { id: REPLY_ID.timeWithin30Days, title: LEAD_TEMPLATES.timeWithin30DaysOption },
      { id: REPLY_ID.timeWithin3Months, title: LEAD_TEMPLATES.timeWithin3MonthsOption },
      { id: REPLY_ID.timeFuture, title: LEAD_TEMPLATES.timeFutureOption },
      { id: REPLY_ID.timeNotNow, title: LEAD_TEMPLATES.timeNotNowOption },
    ];
    return [this.buildChoiceMessage(body, options, LEAD_TEMPLATES.askTimeToBuyListButton)];
  }

  /** V2 payment capture buttons: Financiado / De contado. */
  composeAskPaymentCapture(body: string = LEAD_TEMPLATES.askPaymentCapturePicker): OutboundMessagePlan[] {
    const options: OutboundOption[] = [
      { id: REPLY_ID.paymentFinanced, title: LEAD_TEMPLATES.paymentFinancedOption },
      { id: REPLY_ID.paymentCash, title: LEAD_TEMPLATES.paymentCashOption },
    ];
    return [this.buildChoiceMessage(body, options)];
  }

  /**
   * Attractive monthly-installment offer for a project (text-only; used when totals are needed).
   * When `showTotals` is true (pricePolicy full_price), each line includes the lot total.
   */
  composeFinancingOffer(project: ProjectKnowledge, showTotals = false): OutboundMessagePlan[] {
    const financing = project.financing;
    if (financing === undefined) return [];
    const lineTemplate = showTotals
      ? LEAD_TEMPLATES.financingLotLineWithPrice
      : LEAD_TEMPLATES.financingLotLine;
    const lotLines = financing.plans
      .map((plan) =>
        interpolateTemplate(lineTemplate, {
          area: formatArea(plan.area),
          monthly: formatCop(plan.monthlyPayment),
          ...(showTotals ? { price: formatCop(plan.price) } : {}),
        }),
      )
      .join('\n');
    const terms = this.buildFinancingTerms(financing);
    const intro = interpolateTemplate(LEAD_TEMPLATES.financingIntro, {
      project_name: project.title,
      monthly: formatCop(financing.minMonthlyPayment),
    });
    return [{ kind: 'text', body: `${intro}\n\n${lotLines}\n\n${terms}` }];
  }

  /**
   * V2 financed path: body lists area + monthly cuota; buttons/list titles are size only.
   * Buttons when ≤3 plans; WhatsApp list otherwise. No separation/terms paragraph.
   */
  composeFinancingLotPicker(project: ProjectKnowledge): OutboundMessagePlan[] {
    const financing = project.financing;
    if (financing === undefined || financing.plans.length === 0) return [];
    const lotLines = financing.plans
      .map((plan) =>
        interpolateTemplate(LEAD_TEMPLATES.financingLotPickerLine, {
          area: formatArea(plan.area),
          monthly: formatCop(plan.monthlyPayment),
        }),
      )
      .join('\n\n');
    const body = interpolateTemplate(LEAD_TEMPLATES.financingLotPickerBody, {
      project_name: project.title,
      lot_lines: lotLines,
    });
    const options: OutboundOption[] = financing.plans.map((plan) => {
      const monthly = formatCop(plan.monthlyPayment);
      return {
        id: `${REPLY_ID.lotPrefix}${plan.area}`,
        title: interpolateTemplate(LEAD_TEMPLATES.financingLotOptionTitle, {
          area: formatArea(plan.area),
        }).slice(0, 20),
        description: interpolateTemplate(LEAD_TEMPLATES.financingLotOptionDescription, {
          monthly,
        }),
      };
    });
    return [this.buildChoiceMessage(body, options, LEAD_TEMPLATES.financingLotPickerListButton)];
  }

  /** Short ack after the customer picks a financed lot size. */
  composeLotChoiceAck(area: number): OutboundMessagePlan[] {
    return [
      {
        kind: 'text',
        body: interpolateTemplate(LEAD_TEMPLATES.lotChoiceAck, { area: formatArea(area) }),
      },
    ];
  }

  private buildFinancingTerms(financing: NonNullable<ProjectKnowledge['financing']>): string {
    if (financing.separation > 0) {
      return interpolateTemplate(LEAD_TEMPLATES.financingTerms, {
        separation: formatCop(financing.separation),
        installments: String(financing.installments),
      });
    }
    return interpolateTemplate(LEAD_TEMPLATES.financingTermsNoSeparation, {
      installments: String(financing.installments),
    });
  }

  /** V2 next-step buttons: another question or talk to an advisor. */
  composeAskNextStep(body: string = LEAD_TEMPLATES.askNextStep): OutboundMessagePlan[] {
    const options: OutboundOption[] = [
      { id: REPLY_ID.nextQuestion, title: LEAD_TEMPLATES.nextStepQuestionOption },
      { id: REPLY_ID.nextCall, title: LEAD_TEMPLATES.nextStepCallOption },
    ];
    return [this.buildChoiceMessage(body, options)];
  }

  /** V2 urgency reply buttons. */
  composeAskUrgency(body: string = LEAD_TEMPLATES.askUrgencyPicker): OutboundMessagePlan[] {
    const options: OutboundOption[] = [
      { id: REPLY_ID.urgencyLow, title: LEAD_TEMPLATES.urgencyLowOption },
      { id: REPLY_ID.urgencyMedium, title: LEAD_TEMPLATES.urgencyMediumOption },
      { id: REPLY_ID.urgencyHigh, title: LEAD_TEMPLATES.urgencyHighOption },
    ];
    return [this.buildChoiceMessage(body, options)];
  }

  /** V2 decision-maker list. */
  composeAskDecisionMaker(body: string = LEAD_TEMPLATES.askDecisionMakerPicker): OutboundMessagePlan[] {
    const options: OutboundOption[] = [
      { id: REPLY_ID.decisionSelf, title: LEAD_TEMPLATES.decisionSelfOption },
      { id: REPLY_ID.decisionSpouse, title: LEAD_TEMPLATES.decisionSpouseOption },
      { id: REPLY_ID.decisionFamily, title: LEAD_TEMPLATES.decisionFamilyOption },
      { id: REPLY_ID.decisionOther, title: LEAD_TEMPLATES.decisionOtherOption },
    ];
    return [this.buildChoiceMessage(body, options, LEAD_TEMPLATES.askDecisionMakerListButton)];
  }

  private async buildProjectPickerOptions(): Promise<OutboundOption[]> {
    const projects = await this.projectCatalog.getProjects();
    if (projects.length === 0) {
      this.logger.error('Project catalog is empty; ask_project list will only offer "Me interesan todos"');
    }
    return [
      ...projects.map((project, index) => ({
        id: `${REPLY_ID.projectPrefix}${project.id}`,
        title: `${PROJECT_LIST_EMOJIS[index % PROJECT_LIST_EMOJIS.length]} ${project.title}`,
      })),
      { id: REPLY_ID.allProjects, title: LEAD_TEMPLATES.allProjectsOption },
    ];
  }

  /** Intro text → (3s) plan media → (4s) lot ranges question. Lot question omitted when the project has no lots. */
  composeProjectIntro(firstName: string, project: LeadProject): OutboundMessagePlan[] {
    const intro: OutboundMessagePlan = {
      kind: 'text',
      body: this.render(LEAD_TEMPLATES.projectIntro, firstName, {
        project_name: project.title,
        project_short_description: project.shortDescription,
      }).trim(),
    };
    const plan = this.buildPlanMessage(project);
    const lotQuestion = this.buildLotRangesQuestion(project.lotOptions);
    const steps: OutboundMessagePlan[] = [intro];
    if (plan) steps.push(plan);
    if (lotQuestion) steps.push({ ...lotQuestion, delayMs: plan ? PAUSE_BEFORE_LOT_RANGES_MS : PAUSE_BEFORE_PLAN_MS });
    return steps;
  }

  composeAskPayment(firstName: string): OutboundMessagePlan[] {
    const options: OutboundOption[] = [
      { id: REPLY_ID.paymentFinanced, title: LEAD_TEMPLATES.paymentFinancedOption },
      { id: REPLY_ID.paymentCash, title: LEAD_TEMPLATES.paymentCashOption },
    ];
    return [this.buildChoiceMessage(this.render(LEAD_TEMPLATES.askPayment, firstName), options)];
  }

  /** Schedule question, prefixed with the payment-specific sentence when known. */
  composeAskSchedule(paymentMethod?: LeadPaymentMethod): OutboundMessagePlan[] {
    const leadSentence =
      paymentMethod === 'financed'
        ? LEAD_TEMPLATES.scheduleLeadFinanced
        : paymentMethod === 'cash'
          ? LEAD_TEMPLATES.scheduleLeadCash
          : '';
    const body = [leadSentence, LEAD_TEMPLATES.askSchedule].filter((part) => part !== '').join('\n\n');
    return [this.buildChoiceMessage(body, PERIOD_OPTIONS)];
  }

  /** No free slot in the chosen period: apologize and re-ask the period buttons. */
  composeNoCallSlots(): OutboundMessagePlan[] {
    return [this.buildChoiceMessage(LEAD_TEMPLATES.noCallSlots, PERIOD_OPTIONS)];
  }

  /** Always a list (slot titles exceed the 20-char button limit); `isTaken` prefixes the "slot just got taken" notice. */
  composeAskCallSlot(period: LeadCallPeriod, slots: readonly LeadCallSlot[], isTaken = false): OutboundMessagePlan[] {
    const body = interpolateTemplate(LEAD_TEMPLATES.askCallSlot, { periodo: SLOT_LABELS[period] });
    const question: OutboundMessagePlan = {
      kind: 'list',
      body,
      options: slots.map(buildCallSlotOption),
      listButtonLabel: LEAD_TEMPLATES.askCallSlotListButton,
    };
    return isTaken ? [{ kind: 'text', body: LEAD_TEMPLATES.callSlotTaken }, question] : [question];
  }

  /**
   * Booking confirmation; when the assigned ventor has phone and/or phoneJob,
   * appends a Meta contacts card after a short pause.
   */
  composeConfirmation(
    firstName: string,
    scheduledAt: Date,
    ventor?: VentorAssignmentCandidate,
  ): OutboundMessagePlan[] {
    const fechaLlamada = formatCallSlotDate(scheduledAt, 'long');
    const contact = ventor != null ? buildLeadVentorContact(ventor) : null;
    const asesor =
      ventor != null ? formatLeadVentorDisplayName(ventor) : 'Un asesor';
    if (contact == null) {
      return [
        {
          kind: 'text',
          body: this.render(LEAD_TEMPLATES.confirmation, firstName, {
            fecha_llamada: fechaLlamada,
            asesor,
          }),
        },
      ];
    }
    return [
      {
        kind: 'text',
        body: this.render(LEAD_TEMPLATES.confirmationWithContact, firstName, {
          fecha_llamada: fechaLlamada,
          asesor,
        }),
      },
      {
        kind: 'contacts',
        contact,
        delayMs: PAUSE_BEFORE_VENTOR_CONTACT_MS,
      },
    ];
  }

  composeReminder(): OutboundMessagePlan[] {
    const options: OutboundOption[] = [
      { id: REPLY_ID.reminderYes, title: LEAD_TEMPLATES.reminderYesOption },
      { id: REPLY_ID.reminderNo, title: LEAD_TEMPLATES.reminderNoOption },
    ];
    return [this.buildChoiceMessage(LEAD_TEMPLATES.reminder, options)];
  }

  composeReminderDeclined(firstName: string): OutboundMessagePlan[] {
    return [{ kind: 'text', body: this.render(LEAD_TEMPLATES.reminderDeclined, firstName) }];
  }

  /** Short nudge + the last interactive question again. */
  composeRetry(lastQuestion: readonly OutboundMessagePlan[]): OutboundMessagePlan[] {
    const question = lastQuestion[lastQuestion.length - 1];
    if (!question) return [];
    return [{ kind: 'text', body: LEAD_TEMPLATES.retryPrefix }, { ...question, delayMs: undefined }];
  }

  private buildPlanMessage(project: LeadProject): OutboundMessagePlan | undefined {
    const mediaUrl = this.projectCatalog.buildPlaneUrl(project);
    if (!mediaUrl) return undefined;
    const isPdf = PDF_EXTENSION_REGEX.test(mediaUrl);
    return {
      kind: isPdf ? 'document' : 'image',
      body: LEAD_TEMPLATES.planCaption,
      mediaUrl,
      ...(isPdf ? { fileName: `Plano ${project.title}.pdf` } : {}),
      delayMs: PAUSE_BEFORE_PLAN_MS,
    };
  }

  private buildLotRangesQuestion(lotOptions: readonly LeadProjectLotOption[]): OutboundMessagePlan | undefined {
    const lots = dedupeLotOptionsByArea(lotOptions);
    if (lots.length === 0) return undefined;
    const lotLines = lots
      .map((lot) => interpolateTemplate(LEAD_TEMPLATES.lotLine, { area: formatArea(lot.area), price: formatCop(lot.price) }))
      .join('\n');
    const options: OutboundOption[] = lots.map((lot) => ({
      id: `${REPLY_ID.lotPrefix}${lot.area}`,
      title: `${formatArea(lot.area)} m²`,
      description: `desde ${formatCop(lot.price)}`,
    }));
    const body = interpolateTemplate(LEAD_TEMPLATES.lotRanges, { lot_lines: lotLines });
    return this.buildChoiceMessage(body, options, LEAD_TEMPLATES.lotRangesListButton);
  }

  /** Reply buttons when ≤ 3 options, interactive list otherwise. */
  private buildChoiceMessage(body: string, options: readonly OutboundOption[], listButtonLabel?: string): OutboundMessagePlan {
    const kind = options.length <= MAX_REPLY_BUTTONS ? 'buttons' : 'list';
    return { kind, body, options, ...(kind === 'list' && listButtonLabel ? { listButtonLabel } : {}) };
  }

  private render(template: string, firstName: string, extra: Readonly<Record<string, string>> = {}): string {
    return interpolateTemplate(template, {
      name_suffix: firstName ? `, ${firstName}` : '',
      brand: this.configService.get<string>('leadConversation.brand', 'La Ceiba'),
      location: this.configService.get<string>('leadConversation.location', 'Carmen de Apicalá'),
      ...extra,
    });
  }
}

const formatArea = (area: number): string => area.toLocaleString('es-CO');

/** Sorted by area; keeps the lowest price for duplicated areas. */
function dedupeLotOptionsByArea(lotOptions: readonly LeadProjectLotOption[]): LeadProjectLotOption[] {
  const byArea = new Map<number, LeadProjectLotOption>();
  for (const lot of lotOptions) {
    const existing = byArea.get(lot.area);
    if (!existing || lot.price < existing.price) byArea.set(lot.area, lot);
  }
  return [...byArea.values()].sort((a, b) => a.area - b.area);
}
