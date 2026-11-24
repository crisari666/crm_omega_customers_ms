import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { LeadRecoveryScheduler } from '../lead-assistant/lead-recovery.scheduler';
import { CUSTOMER_SERVICE_WINDOW_MS, MAX_SCORE, MAX_SCORE_V2 } from './constants/lead-conversation.constants';
import type { ListLeadConversationsQueryDto } from './dto/list-lead-conversations-query.dto';
import type { LeadSessionSnapshot } from './lead-conversation-session.service';
import { LeadFlowTransitionsService } from './lead-flow-transitions.service';
import { LeadMessageDispatcherService } from './lead-message-dispatcher.service';
import { LeadReminderScheduler } from './lead-reminder.scheduler';
import {
  LeadConversationMessage,
  LeadConversationMessageDocument,
} from './schemas/lead-conversation-message.schema';
import {
  LeadConversationSession,
  LeadConversationSessionDocument,
} from './schemas/lead-conversation-session.schema';
import type { LeadConversationAdminListItem } from './types/lead-conversation-admin-list-item.type';
import type { LeadConversationAdminListPage } from './types/lead-conversation-admin-list-page.type';
import type { LeadConversationRestartResult } from './types/lead-conversation-restart-result.type';
import type { LeadTemperature } from './types/lead-temperature.type';
import { buildLeadAgentSessionReset } from './utils/build-lead-agent-session-reset.util';
import { buildLeadSessionReset } from './utils/build-lead-session-reset.util';
import { escapeRegex } from './utils/escape-regex.util';

const DEFAULT_PAGE_SIZE = 20;

type SessionWithTimestamps = LeadSessionSnapshot & { readonly createdAt?: Date };
type CustomerContact = Pick<Customer, 'name' | 'lastName' | 'phone'> & { readonly _id: Types.ObjectId };

const toIso = (value?: Date): string | undefined => (value ? new Date(value).toISOString() : undefined);

/** Admin operations on lead qualification conversations: browse, delete and restart the flow. */
@Injectable()
export class LeadConversationAdminService {
  private readonly logger = new Logger(LeadConversationAdminService.name);

  constructor(
    @InjectModel(LeadConversationSession.name)
    private readonly sessionModel: Model<LeadConversationSessionDocument>,
    @InjectModel(LeadConversationMessage.name)
    private readonly messageModel: Model<LeadConversationMessageDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly reminderScheduler: LeadReminderScheduler,
    private readonly transitions: LeadFlowTransitionsService,
    private readonly dispatcher: LeadMessageDispatcherService,
    private readonly recoveryScheduler: LeadRecoveryScheduler,
  ) {}

  async listSessions(query: ListLeadConversationsQueryDto): Promise<LeadConversationAdminListPage> {
    const page = query.page ?? 0;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const filter = buildListFilter(query);
    const [sessions, total] = await Promise.all([
      this.sessionModel.find(filter).sort({ updatedAt: -1 }).skip(page * limit).limit(limit).lean().exec(),
      this.sessionModel.countDocuments(filter).exec(),
    ]);
    const contacts = await this.findCustomerContacts(sessions as SessionWithTimestamps[]);
    const items = (sessions as SessionWithTimestamps[]).map((session) =>
      toListItem(session, contacts.get(String(session.customerId))),
    );
    return { items, total, page, limit };
  }

  /** Deletes the session and its transcript; the next inbound message starts a fresh flow. */
  async deleteSession(sessionId: string): Promise<{ deleted: true }> {
    const session = await this.findSessionOrThrow(sessionId);
    await this.reminderScheduler.executeCancel(sessionId);
    await this.recoveryScheduler.executeCancel(sessionId);
    await this.messageModel.deleteMany({ sessionId: session._id }).exec();
    await this.sessionModel.deleteOne({ _id: session._id }).exec();
    this.logger.log(`Lead conversation ${sessionId} deleted`);
    return { deleted: true };
  }

  /**
   * Resets answers/score and re-sends the welcome + project list when Meta's 24h window is open;
   * otherwise only resets, so the flow restarts on the next customer message.
   */
  async restartSession(sessionId: string): Promise<LeadConversationRestartResult> {
    const session = await this.findSessionOrThrow(sessionId);
    if (session.flowVersion === 'v2') return this.restartAgentSession(session);
    await this.reminderScheduler.executeCancel(sessionId);
    const canSend = isInsideCustomerServiceWindow(session.lastInboundAt);
    const transition = canSend ? await this.transitions.buildAskProject(session) : undefined;
    const question = transition?.outbound[transition.outbound.length - 1];
    const now = new Date();
    const { $set, $unset } = buildLeadSessionReset(question, now);
    await this.sessionModel.updateOne({ _id: session._id }, { $set, $unset, $inc: { version: 1 } }).exec();
    if (!transition) {
      return { restarted: true, sent: false, reason: 'outside_customer_service_window' };
    }
    await this.dispatcher.executeDispatch({
      sessionId,
      customerId: String(session.customerId),
      to: session.waId,
      messages: transition.outbound,
      questionAt: now,
    });
    this.logger.log(`Lead conversation ${sessionId} restarted`);
    return { restarted: true, sent: true };
  }

  /** V2 restart: clean agent conversation that waits for the customer (templates only work inside the 24h window). */
  private async restartAgentSession(session: LeadSessionSnapshot): Promise<LeadConversationRestartResult> {
    const sessionId = String(session._id);
    await this.reminderScheduler.executeCancel(sessionId);
    await this.recoveryScheduler.executeCancel(sessionId);
    const lastInbound = await this.messageModel
      .findOne({ sessionId: session._id, direction: 'inbound' })
      .sort({ _id: -1 })
      .select({ _id: 1 })
      .lean()
      .exec();
    const { $set, $unset } = buildLeadAgentSessionReset({
      ...(lastInbound ? { lastTurnMessageId: String(lastInbound._id) } : {}),
    });
    await this.sessionModel.updateOne({ _id: session._id }, { $set, $unset, $inc: { version: 1 } }).exec();
    this.logger.log(`Lead conversation ${sessionId} (v2) restarted; waiting for the customer`);
    return { restarted: true, sent: false, reason: 'v2_waits_for_customer' };
  }

  private async findSessionOrThrow(sessionId: string): Promise<LeadSessionSnapshot> {
    const session = (await this.sessionModel.findById(sessionId).lean().exec()) as LeadSessionSnapshot | null;
    if (!session) throw new NotFoundException('Lead conversation not found');
    return session;
  }

  private async findCustomerContacts(sessions: readonly SessionWithTimestamps[]): Promise<Map<string, CustomerContact>> {
    const ids = [...new Set(sessions.map((session) => String(session.customerId)))].map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return new Map();
    const customers = (await this.customerModel
      .find({ _id: { $in: ids } }, { name: 1, lastName: 1, phone: 1 })
      .lean()
      .exec()) as unknown as CustomerContact[];
    return new Map(customers.map((customer) => [String(customer._id), customer]));
  }
}

function isInsideCustomerServiceWindow(lastInboundAt?: Date): boolean {
  return Boolean(lastInboundAt) && Date.now() - new Date(lastInboundAt as Date).getTime() < CUSTOMER_SERVICE_WINDOW_MS;
}

function buildListFilter(query: ListLeadConversationsQueryDto): QueryFilter<LeadConversationSessionDocument> {
  const filter: QueryFilter<LeadConversationSessionDocument> = {};
  if (query.status) filter.status = query.status;
  if (query.step) filter.step = query.step;
  if (query.flow === 'v2') filter.flowVersion = 'v2';
  if (query.flow === 'v1') filter.flowVersion = { $ne: 'v2' };
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ waId: pattern }, { profileName: pattern }, { projectTitle: pattern }];
  }
  return filter;
}

function toListItem(session: SessionWithTimestamps, contact?: CustomerContact): LeadConversationAdminListItem {
  const fullName = [contact?.name, contact?.lastName].filter(Boolean).join(' ').trim();
  const isAgentFlow = session.flowVersion === 'v2';
  return {
    sessionId: String(session._id),
    customerId: String(session.customerId),
    customerName: fullName || session.profileName || '',
    phone: contact?.phone || session.waId,
    projectTitle: session.projectTitle,
    isAllProjects: session.isAllProjects,
    step: session.step,
    status: session.status,
    score: session.score,
    maxScore: isAgentFlow ? MAX_SCORE_V2 : MAX_SCORE,
    priority: session.priority,
    flowVersion: isAgentFlow ? 'v2' : 'v1',
    ...(isAgentFlow && session.temperature ? { temperature: session.temperature as LeadTemperature } : {}),
    ...(isAgentFlow && session.leadProfile?.stage ? { stage: session.leadProfile.stage } : {}),
    lastInboundAt: toIso(session.lastInboundAt),
    startedAt: toIso(session.createdAt),
  };
}
