import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerVentorAssignmentService } from '../customer/customer-ventor-assignment.service';
import {
  VentorScheduleEvent,
  VentorScheduleEventDocument,
  VentorScheduleEventSource,
  VentorScheduleEventStatus,
  VentorScheduleEventType,
} from '../ventor-schedule/schemas/ventor-schedule-event.schema';
import {
  BOGOTA_UTC_OFFSET_HOURS,
  CALL_SLOT_MS,
  DAY_MS,
  DEFAULT_CALL_SLOT_LOOKAHEAD_DAYS,
  MAX_CALL_SLOT_OPTIONS,
  MIN_SLOT_LEAD_MINUTES,
  MONGO_DUPLICATE_KEY_CODE,
} from './constants/lead-call-slots.constants';
import { LeadCustomerService } from './lead-customer.service';
import type { BookCallSlotResult } from './types/book-call-slot-result.type';
import type { LeadCallPeriod } from './types/lead-call-period.type';
import type { LeadCallSlot } from './types/lead-call-slot.type';
import { buildPeriodSlotStarts } from './utils/build-period-slot-starts.util';
import { findCallPeriod } from './utils/find-call-period.util';
import { isCallSlotDayOpen } from './utils/is-call-slot-day-open.util';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type BusyEvent = { readonly userId: string; readonly scheduledAt: Date };

type BookSlotInput = {
  readonly sessionId: Types.ObjectId;
  readonly customerId: Types.ObjectId;
  readonly slotStart: Date;
  readonly now?: Date;
};

/**
 * 30-minute lead call slots backed by `ventor_schedule_events` (type `call`).
 * A slot is free when at least one `assignAdvanceLeads` office user has no pending event inside it.
 */
@Injectable()
export class LeadCallSlotService {
  private readonly logger = new Logger(LeadCallSlotService.name);

  constructor(
    @InjectModel(VentorScheduleEvent.name) private readonly eventModel: Model<VentorScheduleEventDocument>,
    private readonly ventorAssignment: CustomerVentorAssignmentService,
    private readonly leadCustomer: LeadCustomerService,
    private readonly configService: ConfigService,
  ) {}

  /** Up to 10 free slots of the period, soonest first, within the lookahead days. */
  async findFreeSlots(period: LeadCallPeriod, now: Date = new Date()): Promise<LeadCallSlot[]> {
    const userIds = await this.findAdvanceUserIds();
    if (userIds.length === 0) return [];
    const starts = buildPeriodSlotStarts({ period, now, lookaheadDays: this.getLookaheadDays() });
    if (starts.length === 0) return [];
    const busy = await this.findBusyEvents(userIds, starts[0], new Date(starts[starts.length - 1].getTime() + CALL_SLOT_MS));
    return starts
      .filter((start) => findFreeUserIds(userIds, busy, start).length > 0)
      .slice(0, MAX_CALL_SLOT_OPTIONS)
      .map((start) => ({ start, period }));
  }

  /**
   * Books the slot with the least-loaded free advance-leads user and assigns the customer to that user.
   * Idempotent per session: an existing pending booking at the same start is returned as is.
   */
  async bookSlot({ sessionId, customerId, slotStart, now = new Date() }: BookSlotInput): Promise<BookCallSlotResult> {
    if (!this.isBookableStart(slotStart, now)) return { booked: false };
    const existing = await this.findPendingSessionCall(sessionId);
    if (existing && existing.scheduledAt.getTime() === slotStart.getTime()) {
      return { booked: true, eventId: String(existing._id), userId: existing.userId, scheduledAt: existing.scheduledAt };
    }
    const userIds = await this.findAdvanceUserIds();
    const busy = await this.findBusyEvents(userIds, slotStart, new Date(slotStart.getTime() + CALL_SLOT_MS));
    const candidates = await this.sortByDayLoad(findFreeUserIds(userIds, busy, slotStart), slotStart);
    for (const userId of candidates) {
      const created = await this.tryCreateCall({ userId, sessionId, customerId, slotStart });
      if (!created) continue;
      if (existing) await this.cancelEvent(existing._id);
      await this.leadCustomer.assignToVentor(customerId, userId);
      this.logger.log(`Lead call booked session=${String(sessionId)} user=${userId} at=${slotStart.toISOString()}`);
      return { booked: true, eventId: String(created._id), userId, scheduledAt: slotStart };
    }
    return { booked: false };
  }

  /** Free advance-leads users at a slot start (excluding `excludeUserId`), least loaded that day first. */
  async findFreeUserIdsAt(slotStart: Date, excludeUserId?: string): Promise<string[]> {
    const userIds = (await this.findAdvanceUserIds()).filter((id) => id !== excludeUserId);
    const busy = await this.findBusyEvents(userIds, slotStart, new Date(slotStart.getTime() + CALL_SLOT_MS));
    return this.sortByDayLoad(findFreeUserIds(userIds, busy, slotStart), slotStart);
  }

  async findAdvanceUserIds(): Promise<string[]> {
    const ventors = await this.ventorAssignment.executeFetchAdvanceLeadVentors();
    if (ventors.length === 0) {
      this.logger.warn('No assignAdvanceLeads users from office_back; no lead call slots available');
    }
    return ventors.map((ventor) => ventor.id);
  }

  private isBookableStart(slotStart: Date, now: Date): boolean {
    const isFarEnough = slotStart.getTime() >= now.getTime() + MIN_SLOT_LEAD_MINUTES * MINUTE_MS;
    const isWithinLookahead = slotStart.getTime() <= now.getTime() + this.getLookaheadDays() * DAY_MS;
    return isFarEnough && isWithinLookahead && findCallPeriod(slotStart) !== undefined && isCallSlotDayOpen(slotStart, now);
  }

  private async findBusyEvents(userIds: readonly string[], from: Date, to: Date): Promise<BusyEvent[]> {
    if (userIds.length === 0) return [];
    return this.eventModel
      .find({
        userId: { $in: userIds },
        status: VentorScheduleEventStatus.Pending,
        scheduledAt: { $gt: new Date(from.getTime() - CALL_SLOT_MS), $lt: to },
      })
      .select({ userId: 1, scheduledAt: 1 })
      .lean<BusyEvent[]>()
      .exec();
  }

  private findPendingSessionCall(sessionId: Types.ObjectId): Promise<(BusyEvent & { _id: Types.ObjectId }) | null> {
    return this.eventModel
      .findOne({
        leadConversationSessionId: sessionId,
        eventType: VentorScheduleEventType.Call,
        status: VentorScheduleEventStatus.Pending,
      })
      .select({ userId: 1, scheduledAt: 1 })
      .lean<BusyEvent & { _id: Types.ObjectId }>()
      .exec();
  }

  private async sortByDayLoad(userIds: readonly string[], slotStart: Date): Promise<string[]> {
    if (userIds.length <= 1) return [...userIds];
    const { dayStart, dayEnd } = buildBogotaDayBounds(slotStart);
    const rows = await this.eventModel
      .aggregate<{ _id: string; count: number }>([
        {
          $match: {
            userId: { $in: userIds },
            eventType: VentorScheduleEventType.Call,
            status: VentorScheduleEventStatus.Pending,
            scheduledAt: { $gte: dayStart, $lt: dayEnd },
          },
        },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
      .exec();
    const countByUser = new Map(rows.map((row) => [row._id, row.count]));
    return [...userIds].sort((a, b) => (countByUser.get(a) ?? 0) - (countByUser.get(b) ?? 0) || a.localeCompare(b));
  }

  private async tryCreateCall(input: {
    readonly userId: string;
    readonly sessionId: Types.ObjectId;
    readonly customerId: Types.ObjectId;
    readonly slotStart: Date;
  }): Promise<VentorScheduleEventDocument | null> {
    try {
      return await this.eventModel.create({
        userId: input.userId,
        customerId: input.customerId,
        scheduledAt: input.slotStart,
        eventType: VentorScheduleEventType.Call,
        status: VentorScheduleEventStatus.Pending,
        source: VentorScheduleEventSource.LeadConversation,
        leadConversationSessionId: input.sessionId,
        note: 'Llamada agendada por el asistente IA de leads',
      });
    } catch (err: unknown) {
      if ((err as { code?: number }).code === MONGO_DUPLICATE_KEY_CODE) return null;
      throw err;
    }
  }

  private async cancelEvent(eventId: Types.ObjectId): Promise<void> {
    await this.eventModel.updateOne({ _id: eventId }, { $set: { status: VentorScheduleEventStatus.Cancelled } }).exec();
  }

  private getLookaheadDays(): number {
    const raw = this.configService.get<number>('leadConversation.callSlotLookaheadDays', DEFAULT_CALL_SLOT_LOOKAHEAD_DAYS);
    return typeof raw === 'number' && raw > 0 ? raw : DEFAULT_CALL_SLOT_LOOKAHEAD_DAYS;
  }
}

/** Users with no pending event overlapping `[start, start + 30 min)`. */
function findFreeUserIds(userIds: readonly string[], busy: readonly BusyEvent[], start: Date): string[] {
  const slotEnd = start.getTime() + CALL_SLOT_MS;
  const busyUsers = new Set(
    busy
      .filter((event) => {
        const eventStart = new Date(event.scheduledAt).getTime();
        return eventStart < slotEnd && eventStart + CALL_SLOT_MS > start.getTime();
      })
      .map((event) => event.userId),
  );
  return userIds.filter((id) => !busyUsers.has(id));
}

function buildBogotaDayBounds(instant: Date): { readonly dayStart: Date; readonly dayEnd: Date } {
  const local = new Date(instant.getTime() + BOGOTA_UTC_OFFSET_HOURS * HOUR_MS);
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const dayStart = new Date(localMidnight - BOGOTA_UTC_OFFSET_HOURS * HOUR_MS);
  return { dayStart, dayEnd: new Date(dayStart.getTime() + DAY_MS) };
}
