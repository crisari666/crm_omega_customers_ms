import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PAYMENT_LABELS, SLOT_LABELS } from './constants/answer-mappings.constants';
import { formatCallSlotDate } from './utils/format-call-slot-date.util';
import { MAX_SCORE, MAX_SCORE_V2 } from './constants/lead-conversation.constants';
import { LeadConversationSessionService, type LeadSessionSnapshot } from './lead-conversation-session.service';
import {
  LeadConversationMessage,
  LeadConversationMessageDocument,
} from './schemas/lead-conversation-message.schema';
import type { LeadConversationMessagesPage } from './types/lead-conversation-messages-page.type';
import type { LeadConversationSummary, LeadConversationSummaryItem } from './types/lead-conversation-summary.type';
import type { LeadTemperature } from './types/lead-temperature.type';
import { LeadAgentScoringService } from './v2/lead-agent-scoring.service';
import { buildLeadAgentSummaryItems } from './v2/utils/build-lead-agent-summary-items.util';

const DEFAULT_PAGE_SIZE = 50;

type MessagesPageInput = { readonly limit?: number; readonly before?: string };

const toIso = (value?: Date): string | undefined => (value ? new Date(value).toISOString() : undefined);

/** Read side of the lead conversation for the ventor/admin apps. */
@Injectable()
export class LeadConversationQueryService {
  constructor(
    private readonly sessionService: LeadConversationSessionService,
    @InjectModel(LeadConversationMessage.name)
    private readonly messageModel: Model<LeadConversationMessageDocument>,
    private readonly agentScoring: LeadAgentScoringService,
  ) {}

  async getSummary(customerId: string): Promise<LeadConversationSummary> {
    const session = await this.sessionService.findLatestByCustomerId(customerId);
    if (!session) {
      return { customerId, hasSession: false, score: 0, maxScore: MAX_SCORE, priority: 0, isAllProjects: false, flowVersion: 'v1', answers: {}, items: [] };
    }
    const isAgentFlow = session.flowVersion === 'v2';
    return {
      customerId,
      hasSession: true,
      sessionId: String(session._id),
      step: session.step,
      status: session.status,
      score: session.score,
      maxScore: isAgentFlow ? MAX_SCORE_V2 : MAX_SCORE,
      priority: session.priority,
      projectId: session.projectId,
      projectTitle: session.projectTitle,
      isAllProjects: session.isAllProjects,
      flowVersion: isAgentFlow ? 'v2' : 'v1',
      ...this.buildAgentFields(session),
      answers: session.answers ?? {},
      items: isAgentFlow ? buildLeadAgentSummaryItems(session) : buildSummaryItems(session),
      assignedVentorId: session.assignedVentorId,
      scheduledAt: toIso(session.scheduledAt),
      lastInboundAt: toIso(session.lastInboundAt),
      startedAt: toIso((session as LeadSessionSnapshot & { createdAt?: Date }).createdAt),
    };
  }

  /** V2-only summary fields; empty for V1 sessions so their payload keeps its shape. */
  private buildAgentFields(session: LeadSessionSnapshot): Partial<LeadConversationSummary> {
    if (session.flowVersion !== 'v2') return {};
    return {
      ...(session.temperature ? { temperature: session.temperature as LeadTemperature } : {}),
      ...(session.leadProfile?.stage ? { stage: session.leadProfile.stage } : {}),
      ...(session.advisorBrief ? { advisorBrief: session.advisorBrief } : {}),
      scoreSegments: this.agentScoring.buildScoreSegments(session.scoreSignals ?? []),
    };
  }

  listMessages(customerId: string, input: MessagesPageInput): Promise<LeadConversationMessagesPage> {
    return this.listMessagesBy({ customerId: new Types.ObjectId(customerId) }, input);
  }

  listMessagesBySession(sessionId: string, input: MessagesPageInput): Promise<LeadConversationMessagesPage> {
    return this.listMessagesBy({ sessionId: new Types.ObjectId(sessionId) }, input);
  }

  private async listMessagesBy(
    owner: { customerId: Types.ObjectId } | { sessionId: Types.ObjectId },
    input: MessagesPageInput,
  ): Promise<LeadConversationMessagesPage> {
    const limit = input.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.messageModel
      .find({
        ...owner,
        ...(input.before ? { timestamp: { $lt: new Date(input.before) } } : {}),
      })
      .sort({ timestamp: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    return {
      items: page.map((row) => ({
        id: String(row._id),
        direction: row.direction,
        kind: row.kind,
        body: row.body ?? '',
        options: row.options ?? [],
        mediaUrl: row.mediaUrl,
        delivered: row.delivered !== false,
        timestamp: new Date(row.timestamp).toISOString(),
      })),
      ...(hasMore && page.length > 0 ? { nextBefore: new Date(page[0].timestamp).toISOString() } : {}),
    };
  }
}

function buildSummaryItems(session: LeadSessionSnapshot): LeadConversationSummaryItem[] {
  const answers = session.answers ?? {};
  const project = session.isAllProjects ? 'Todos los proyectos' : session.projectTitle;
  const items: (LeadConversationSummaryItem | null)[] = [
    project ? { key: 'project', label: 'Proyecto', value: project } : null,
    answers.rangoLote ? { key: 'rangoLote', label: 'Rango de lote', value: answers.rangoLote } : null,
    answers.formaPago ? { key: 'formaPago', label: 'Forma de pago', value: PAYMENT_LABELS[answers.formaPago] } : null,
    answers.horarioLlamada
      ? {
          key: 'horarioLlamada',
          label: 'Horario de llamada',
          value: SLOT_LABELS[answers.horarioLlamada] ?? answers.horarioLlamada,
        }
      : null,
    answers.fechaLlamada
      ? { key: 'fechaLlamada', label: 'Llamada agendada', value: formatCallSlotDate(new Date(answers.fechaLlamada), 'long') }
      : null,
  ];
  return items.filter((item): item is LeadConversationSummaryItem => item !== null);
}
