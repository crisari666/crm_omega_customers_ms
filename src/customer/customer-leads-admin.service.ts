import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import {
  LeadConversationSession,
  LeadConversationSessionDocument,
} from '../lead-conversation/schemas/lead-conversation-session.schema';
import {
  VentorScheduleEvent,
  VentorScheduleEventDocument,
  VentorScheduleEventStatus,
  VentorScheduleEventType,
} from '../ventor-schedule/schemas/ventor-schedule-event.schema';
import { CustomerService } from './customer.service';
import type { ConvertAdminLeadDto } from './dto/convert-admin-lead.dto';
import type { ListAdminLeadsQueryDto } from './dto/list-admin-leads.query.dto';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import type { CustomerLeadSource } from './types/customer-lead-source.type';
import type { CustomerLifecycleStatus } from './types/customer-lifecycle-status.type';
import type {
  AdminLeadListItem,
  AdminLeadListPage,
  AdminLeadScheduledCall,
} from './types/admin-lead-list-item.type';

const DEFAULT_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const LEAD_INGRESS_ACTORS = [
  'meta-leadgen-ingest',
  'lead-conversation-bot',
  'meta-gateway-ingest',
] as const;

const CREATED_BY_TO_SOURCE: Readonly<Record<string, CustomerLeadSource>> = {
  'meta-leadgen-ingest': 'meta_form',
  'lead-conversation-bot': 'whatsapp_lead_conversation',
  'meta-gateway-ingest': 'whatsapp_inbound',
};

type SessionLean = {
  readonly _id: Types.ObjectId;
  readonly customerId: Types.ObjectId;
  readonly status: string;
  readonly score?: number;
  readonly priority?: number;
  readonly step?: string;
  readonly lastInboundAt?: Date;
};

type ScheduleLean = {
  readonly _id: Types.ObjectId;
  readonly customerId: Types.ObjectId;
  readonly scheduledAt: Date;
  readonly status: string;
  readonly userId?: string;
  readonly note?: string;
};

type CustomerLeadLean = {
  readonly _id: Types.ObjectId;
  readonly name?: string;
  readonly lastName?: string;
  readonly phone: string;
  readonly lifecycleStatus?: CustomerLifecycleStatus;
  readonly leadSources?: CustomerLeadSource[];
  readonly assignedTo?: string;
  readonly metaLeadgenId?: string;
  readonly createdAt?: Date;
  readonly isProspect?: boolean;
};

/**
 * Admin inbox for Customer rows with lead lifecycle / source tags.
 */
@Injectable()
export class CustomerLeadsAdminService {
  private readonly logger = new Logger(CustomerLeadsAdminService.name);

  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(LeadConversationSession.name)
    private readonly sessionModel: Model<LeadConversationSessionDocument>,
    @InjectModel(VentorScheduleEvent.name)
    private readonly scheduleModel: Model<VentorScheduleEventDocument>,
    private readonly customerService: CustomerService,
  ) {}

  async listLeads(query: ListAdminLeadsQueryDto): Promise<AdminLeadListPage> {
    const page = query.page ?? 0;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const filter = this.buildFilter(query);
    const [rows, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(page * limit)
        .limit(limit)
        .lean<CustomerLeadLean[]>()
        .exec(),
      this.customerModel.countDocuments(filter).exec(),
    ]);
    const customerIds = rows.map((row) => row._id);
    const [sessions, schedules] = await Promise.all([
      this.findLatestSessions(customerIds),
      this.findNextScheduledCalls(customerIds),
    ]);
    const items = rows.map((row) =>
      this.toItem(row, sessions.get(String(row._id)), schedules.get(String(row._id))),
    );
    return { items, total, page, limit };
  }

  async convertLead(
    customerId: string,
    body: ConvertAdminLeadDto,
    actorUserId: string,
  ): Promise<AdminLeadListItem> {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new NotFoundException('Lead not found');
    }
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) {
      throw new NotFoundException('Lead not found');
    }
    if (customer.lifecycleStatus === 'customer') {
      throw new BadRequestException('Already converted to customer');
    }
    customer.lifecycleStatus = 'customer';
    customer.isProspect = false;
    if (!customer.leadSources?.length) {
      const inferredSource = CREATED_BY_TO_SOURCE[customer.createdBy ?? ''];
      if (inferredSource) {
        customer.leadSources = [inferredSource];
      }
    }
    customer.$locals['__auditActorUserId'] = actorUserId;
    await customer.save();
    if (body.assignToUserId?.trim()) {
      await this.customerService.assignCustomerAssignee(
        customerId,
        { assignedTo: body.assignToUserId.trim() },
        actorUserId,
      );
    }
    this.logger.log(`Converted lead ${customerId} to customer by ${actorUserId}`);
    const refreshed = await this.customerModel.findById(customerId).lean<CustomerLeadLean>().exec();
    if (!refreshed) {
      throw new NotFoundException('Lead not found');
    }
    const [sessions, schedules] = await Promise.all([
      this.findLatestSessions([refreshed._id]),
      this.findNextScheduledCalls([refreshed._id]),
    ]);
    return this.toItem(
      refreshed,
      sessions.get(String(refreshed._id)),
      schedules.get(String(refreshed._id)),
    );
  }

  private buildFilter(query: ListAdminLeadsQueryDto): QueryFilter<CustomerDocument> {
    const filter: QueryFilter<CustomerDocument> = {};
    if (query.lifecycleStatus) {
      filter.lifecycleStatus = query.lifecycleStatus;
    } else {
      // Default inbox: open leads, any row with source tags, Meta/WA ingress creators (incl. converted), legacy prospects
      filter.$or = [
        { lifecycleStatus: 'lead' },
        { 'leadSources.0': { $exists: true } },
        { createdBy: { $in: [...LEAD_INGRESS_ACTORS] } },
        { lifecycleStatus: { $exists: false }, isProspect: true },
      ];
    }
    if (query.source) {
      filter.leadSources = query.source;
    }
    if (query.assignedTo?.trim()) {
      filter.assignedTo = query.assignedTo.trim();
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      const searchOr = [
        { phone: { $regex: escapeRegex(q), $options: 'i' } },
        { name: { $regex: escapeRegex(q), $options: 'i' } },
        { lastName: { $regex: escapeRegex(q), $options: 'i' } },
      ];
      filter.$and = [...(filter.$and ?? []), { $or: searchOr }];
    }
    if (query.from || query.to) {
      const createdAt: { $gte?: Date; $lt?: Date } = {};
      if (query.from) {
        createdAt.$gte = new Date(`${query.from}T00:00:00.000Z`);
      }
      if (query.to) {
        createdAt.$lt = new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + DAY_MS);
      }
      filter.createdAt = createdAt;
    }
    return filter;
  }

  private async findLatestSessions(
    customerIds: readonly Types.ObjectId[],
  ): Promise<Map<string, SessionLean>> {
    if (customerIds.length === 0) {
      return new Map();
    }
    const rows = await this.sessionModel
      .find({ customerId: { $in: customerIds } })
      .select({ customerId: 1, status: 1, score: 1, priority: 1, step: 1, lastInboundAt: 1 })
      .sort({ lastInboundAt: -1 })
      .lean<SessionLean[]>()
      .exec();
    const map = new Map<string, SessionLean>();
    for (const row of rows) {
      const key = String(row.customerId);
      if (!map.has(key)) {
        map.set(key, row);
      }
    }
    return map;
  }

  /**
   * Next upcoming pending call event per customer (earliest scheduledAt >= now).
   */
  private async findNextScheduledCalls(
    customerIds: readonly Types.ObjectId[],
  ): Promise<Map<string, AdminLeadScheduledCall>> {
    if (customerIds.length === 0) {
      return new Map();
    }
    const now = new Date();
    const rows = await this.scheduleModel
      .find({
        customerId: { $in: customerIds },
        eventType: VentorScheduleEventType.Call,
        status: VentorScheduleEventStatus.Pending,
        scheduledAt: { $gte: now },
      })
      .select({ customerId: 1, scheduledAt: 1, status: 1, userId: 1, note: 1 })
      .sort({ scheduledAt: 1 })
      .lean<ScheduleLean[]>()
      .exec();
    const map = new Map<string, AdminLeadScheduledCall>();
    for (const row of rows) {
      const key = String(row.customerId);
      if (map.has(key)) {
        continue;
      }
      map.set(key, {
        eventId: String(row._id),
        scheduledAt: toIso(row.scheduledAt),
        status: row.status,
        ...(row.userId?.trim() ? { ventorName: row.userId.trim() } : {}),
        ...(row.note?.trim() ? { note: row.note.trim() } : {}),
      });
    }
    return map;
  }

  private toItem(
    row: CustomerLeadLean,
    session?: SessionLean,
    scheduledCall?: AdminLeadScheduledCall,
  ): AdminLeadListItem {
    const lifecycle = resolveLifecycle(row);
    const sources = row.leadSources ?? [];
    return {
      id: String(row._id),
      name: row.name ?? '',
      lastName: row.lastName ?? '',
      phone: row.phone,
      lifecycleStatus: lifecycle,
      leadSources: sources,
      isPromoted: lifecycle === 'customer',
      ...(row.assignedTo ? { assignedTo: row.assignedTo } : {}),
      ...(row.metaLeadgenId ? { metaLeadgenId: row.metaLeadgenId } : {}),
      createdAt: toIso(row.createdAt),
      ...(session
        ? {
            leadSession: {
              sessionId: String(session._id),
              status: session.status,
              ...(session.score !== undefined ? { score: session.score } : {}),
              ...(session.priority !== undefined ? { priority: session.priority } : {}),
              ...(session.step ? { step: session.step } : {}),
            },
          }
        : {}),
      ...(scheduledCall ? { scheduledCall } : {}),
    };
  }
}

function resolveLifecycle(row: CustomerLeadLean): CustomerLifecycleStatus {
  if (row.lifecycleStatus === 'customer' || row.lifecycleStatus === 'lead') {
    return row.lifecycleStatus;
  }
  // Legacy docs without lifecycleStatus: non-prospects are already customers in CRM terms.
  if (row.isProspect === false) {
    return 'customer';
  }
  return 'lead';
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return new Date(0).toISOString();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
