import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { CustomerVentorAssignmentService } from '../customer/customer-ventor-assignment.service';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import {
  VentorScheduleEvent,
  VentorScheduleEventDocument,
  VentorScheduleEventSource,
  VentorScheduleEventStatus,
  VentorScheduleEventType,
} from '../ventor-schedule/schemas/ventor-schedule-event.schema';
import { BOGOTA_UTC_OFFSET_HOURS, DAY_MS, MONGO_DUPLICATE_KEY_CODE } from './constants/lead-call-slots.constants';
import { MAX_SCORE } from './constants/lead-conversation.constants';
import type { ListLeadCallsQueryDto } from './dto/list-lead-calls-query.dto';
import { LeadCallSlotService } from './lead-call-slot.service';
import { LeadConversationSessionService } from './lead-conversation-session.service';
import { LeadCustomerService } from './lead-customer.service';
import {
  LeadConversationSession,
  LeadConversationSessionDocument,
} from './schemas/lead-conversation-session.schema';
import type { LeadCallAdminItem } from './types/lead-call-admin-item.type';
import type { LeadCallVentor } from './types/lead-call-ventor.type';

const HOUR_MS = 60 * 60 * 1000;
const MAX_RANGE_DAYS = 31;

type CallEventRow = {
  readonly _id: Types.ObjectId;
  readonly userId: string;
  readonly customerId: Types.ObjectId;
  readonly scheduledAt: Date;
  readonly status: VentorScheduleEventStatus;
  readonly source?: VentorScheduleEventSource;
  readonly leadConversationSessionId?: Types.ObjectId;
  readonly note?: string;
};

type CustomerContact = { readonly _id: Types.ObjectId; readonly name?: string; readonly lastName?: string; readonly phone?: string };
type SessionScore = Pick<LeadConversationSession, 'score' | 'priority' | 'projectTitle' | 'isAllProjects'> & {
  readonly _id: Types.ObjectId;
};

type ReassignInput = { readonly eventId: string; readonly userId?: string; readonly actorUserId: string };

/** Admin agenda of `call` schedule events (lead calls): list, reassign ventor, mark done / cancel. */
@Injectable()
export class LeadCallScheduleAdminService {
  private readonly logger = new Logger(LeadCallScheduleAdminService.name);

  constructor(
    @InjectModel(VentorScheduleEvent.name) private readonly eventModel: Model<VentorScheduleEventDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(LeadConversationSession.name) private readonly sessionModel: Model<LeadConversationSessionDocument>,
    private readonly ventorAssignment: CustomerVentorAssignmentService,
    private readonly callSlots: LeadCallSlotService,
    private readonly leadCustomer: LeadCustomerService,
    private readonly sessionService: LeadConversationSessionService,
  ) {}

  async listCalls(query: ListLeadCallsQueryDto): Promise<LeadCallAdminItem[]> {
    const { start, end } = buildRange(query.from, query.to);
    const filter: QueryFilter<VentorScheduleEventDocument> = {
      eventType: VentorScheduleEventType.Call,
      scheduledAt: { $gte: start, $lt: end },
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const events = await this.eventModel.find(filter).sort({ scheduledAt: 1 }).lean<CallEventRow[]>().exec();
    const [contacts, sessions, ventors] = await Promise.all([
      this.findContacts(events),
      this.findSessions(events),
      this.listVentors(),
    ]);
    const ventorNames = new Map(ventors.map((ventor) => [ventor.id, ventor.name]));
    return events.map((event) =>
      toItem(event, contacts.get(String(event.customerId)), sessionOf(sessions, event), ventorNames.get(event.userId)),
    );
  }

  async listVentors(): Promise<LeadCallVentor[]> {
    const ventors = await this.ventorAssignment.executeFetchAdvanceLeadVentors();
    return ventors.map((ventor) => ({ id: ventor.id, name: `${ventor.name} ${ventor.lastName}`.trim() || ventor.id }));
  }

  /**
   * Moves a pending call to another advance-leads user free at that slot (explicit or least loaded),
   * and reassigns the customer (and the lead session) to that user.
   */
  async reassignCall({ eventId, userId, actorUserId }: ReassignInput): Promise<LeadCallAdminItem> {
    const event = await this.findPendingCall(eventId);
    const freeUserIds = await this.callSlots.findFreeUserIdsAt(event.scheduledAt, event.userId);
    const targetUserId = userId ?? freeUserIds[0];
    if (!targetUserId) throw new ConflictException('No hay asesores libres en ese horario');
    if (!freeUserIds.includes(targetUserId)) {
      throw new ConflictException('El asesor no está habilitado para leads calificados o no está libre en ese horario');
    }
    await this.executeMoveEvent(event._id, targetUserId);
    await this.leadCustomer.assignToVentor(event.customerId, targetUserId, actorUserId);
    if (event.leadConversationSessionId) {
      await this.sessionService.setAssignedVentor(event.leadConversationSessionId, targetUserId);
    }
    this.logger.log(`Lead call ${eventId} reassigned ${event.userId} → ${targetUserId} by ${actorUserId}`);
    return this.findItem(event._id);
  }

  async updateStatus(eventId: string, status: VentorScheduleEventStatus): Promise<LeadCallAdminItem> {
    const updated = await this.eventModel
      .updateOne({ _id: new Types.ObjectId(eventId), eventType: VentorScheduleEventType.Call }, { $set: { status } })
      .exec();
    if (updated.matchedCount === 0) throw new NotFoundException('Llamada no encontrada');
    return this.findItem(new Types.ObjectId(eventId));
  }

  private async findPendingCall(eventId: string): Promise<CallEventRow> {
    const event = await this.eventModel
      .findOne({ _id: new Types.ObjectId(eventId), eventType: VentorScheduleEventType.Call })
      .lean<CallEventRow>()
      .exec();
    if (!event) throw new NotFoundException('Llamada no encontrada');
    if (event.status !== VentorScheduleEventStatus.Pending) {
      throw new BadRequestException('Solo se pueden reasignar llamadas pendientes');
    }
    return event;
  }

  private async executeMoveEvent(eventId: Types.ObjectId, userId: string): Promise<void> {
    try {
      await this.eventModel.updateOne({ _id: eventId }, { $set: { userId } }).exec();
    } catch (err: unknown) {
      if ((err as { code?: number }).code === MONGO_DUPLICATE_KEY_CODE) {
        throw new ConflictException('El asesor ya tiene una llamada en ese horario');
      }
      throw err;
    }
  }

  private async findItem(eventId: Types.ObjectId): Promise<LeadCallAdminItem> {
    const event = await this.eventModel.findById(eventId).lean<CallEventRow>().exec();
    if (!event) throw new NotFoundException('Llamada no encontrada');
    const [contacts, sessions, ventors] = await Promise.all([
      this.findContacts([event]),
      this.findSessions([event]),
      this.listVentors(),
    ]);
    const ventorName = ventors.find((ventor) => ventor.id === event.userId)?.name;
    return toItem(event, contacts.get(String(event.customerId)), sessionOf(sessions, event), ventorName);
  }

  private async findContacts(events: readonly CallEventRow[]): Promise<Map<string, CustomerContact>> {
    const ids = [...new Set(events.map((event) => String(event.customerId)))].map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return new Map();
    const rows = await this.customerModel
      .find({ _id: { $in: ids } })
      .select({ name: 1, lastName: 1, phone: 1 })
      .lean<CustomerContact[]>()
      .exec();
    return new Map(rows.map((row) => [String(row._id), row]));
  }

  private async findSessions(events: readonly CallEventRow[]): Promise<Map<string, SessionScore>> {
    const ids = events.flatMap((event) => (event.leadConversationSessionId ? [event.leadConversationSessionId] : []));
    if (ids.length === 0) return new Map();
    const rows = await this.sessionModel
      .find({ _id: { $in: ids } })
      .select({ score: 1, priority: 1, projectTitle: 1, isAllProjects: 1 })
      .lean<SessionScore[]>()
      .exec();
    return new Map(rows.map((row) => [String(row._id), row]));
  }
}

const sessionOf = (sessions: Map<string, SessionScore>, event: CallEventRow): SessionScore | undefined =>
  event.leadConversationSessionId ? sessions.get(String(event.leadConversationSessionId)) : undefined;

function toItem(
  event: CallEventRow,
  contact: CustomerContact | undefined,
  session: SessionScore | undefined,
  ventorName: string | undefined,
): LeadCallAdminItem {
  return {
    eventId: String(event._id),
    scheduledAt: new Date(event.scheduledAt).toISOString(),
    status: event.status,
    source: event.source ?? VentorScheduleEventSource.Manual,
    userId: event.userId,
    ventorName: ventorName ?? '',
    customerId: String(event.customerId),
    customerName: `${contact?.name ?? ''} ${contact?.lastName ?? ''}`.trim(),
    phone: contact?.phone ?? '',
    sessionId: event.leadConversationSessionId ? String(event.leadConversationSessionId) : undefined,
    score: session?.score,
    maxScore: MAX_SCORE,
    priority: session?.priority,
    projectTitle: session?.isAllProjects ? 'Todos los proyectos' : session?.projectTitle,
    note: event.note,
  };
}

/** Bogota calendar days [from, to] as a UTC range. */
function buildRange(from: string, to: string): { readonly start: Date; readonly end: Date } {
  const start = new Date(Date.parse(`${from}T00:00:00.000Z`) - BOGOTA_UTC_OFFSET_HOURS * HOUR_MS);
  const end = new Date(Date.parse(`${to}T00:00:00.000Z`) - BOGOTA_UTC_OFFSET_HOURS * HOUR_MS + DAY_MS);
  const days = (end.getTime() - start.getTime()) / DAY_MS;
  if (Number.isNaN(days) || days <= 0 || days > MAX_RANGE_DAYS) {
    throw new BadRequestException(`El rango debe estar entre 1 y ${MAX_RANGE_DAYS} días`);
  }
  return { start, end };
}
