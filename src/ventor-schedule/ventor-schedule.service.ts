import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { CreateVentorScheduleEventDto } from './dto/create-ventor-schedule-event.dto';
import { SyncVentorMeetCallDto } from '../customer/dto/sync-ventor-meet-call.dto';
import { CustomerEventsService } from '../customer/customer-events.service';
import { CustomerCallLogsService } from '../customer/customer-call-logs.service';
import type { CustomerCallLogAdminItemDto } from '../customer/types/customer-call-logs.type';
import {
  VentorScheduleEvent,
  VentorScheduleEventDocument,
  VentorScheduleEventStatus,
  VentorScheduleEventType,
} from './schemas/ventor-schedule-event.schema';

const ON_LAND_SCHEDULE_METADATA_KEY = 'ventorScheduleEventId' as const;

const ON_LAND_CUSTOMER_EVENT_DESCRIPTION = {
  customSentLand: 'Customer sent to land: visit scheduled.',
  visitCancelled: 'On-land visit cancelled.',
  visitCompleted: 'On-land visit completed.',
} as const;

function parseUtcDateTime(dateYmd: string, timeHm: string): Date {
  const [y, mo, d] = dateYmd.split('-').map((n) => Number.parseInt(n, 10));
  const [h, mi] = timeHm.split(':').map((n) => Number.parseInt(n, 10));
  return new Date(Date.UTC(y, mo - 1, d, h, mi, 0, 0));
}

/** Inclusive start / exclusive end of UTC calendar day for `YYYY-MM-DD`. */
function utcDayRange(dateYmd: string): { start: Date; end: Date } {
  const [y, mo, d] = dateYmd.split('-').map((n) => Number.parseInt(n, 10));
  const start = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo - 1, d + 1, 0, 0, 0, 0));
  return { start, end };
}

@Injectable()
export class VentorScheduleService {
  constructor(
    @InjectModel(VentorScheduleEvent.name)
    private readonly scheduleModel: Model<VentorScheduleEventDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly customerEventsService: CustomerEventsService,
    private readonly customerCallLogsService: CustomerCallLogsService,
  ) {}

  private async assertCustomerAccessible(
    userId: string,
    customerId: string,
  ): Promise<CustomerDocument> {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new NotFoundException('Customer not found');
    }
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    const ok =
      customer.createdBy === userId ||
      (customer.assignedTo != null && customer.assignedTo === userId);
    if (!ok) {
      throw new ForbiddenException('Customer is not in your scope');
    }
    return customer;
  }

  private buildScheduleEventMetadata(
    scheduleId: Types.ObjectId,
    scheduledAt: Date,
  ): Record<string, unknown> {
    return {
      [ON_LAND_SCHEDULE_METADATA_KEY]: String(scheduleId),
      scheduledAt: scheduledAt.toISOString(),
    };
  }

  private async recordCustomSentLandEvent(
    userId: string,
    customerId: string,
    scheduleId: Types.ObjectId,
    scheduledAt: Date,
  ): Promise<void> {
    await this.customerEventsService.createEvent({
      customerId,
      actorUserId: userId,
      body: {
        eventType: 'CUSTOM_SENT_LAND',
        description: ON_LAND_CUSTOMER_EVENT_DESCRIPTION.customSentLand,
        metadata: this.buildScheduleEventMetadata(scheduleId, scheduledAt),
      },
    });
  }

  private async recordOnLandStatusCustomerEvent(args: {
    readonly userId: string;
    readonly customerId: string;
    readonly scheduleId: Types.ObjectId;
    readonly scheduledAt: Date;
    readonly eventType: 'CUSTOMER_CANCELLED_VISIT_LAND' | 'CUSTOMER_VISIT_LAND';
    readonly description: string;
  }): Promise<void> {
    await this.customerEventsService.createEvent({
      customerId: args.customerId,
      actorUserId: args.userId,
      body: {
        eventType: args.eventType,
        description: args.description,
        metadata: this.buildScheduleEventMetadata(args.scheduleId, args.scheduledAt),
      },
    });
  }

  async create(
    userId: string,
    dto: CreateVentorScheduleEventDto,
  ): Promise<VentorScheduleEventDocument> {
    await this.assertCustomerAccessible(userId, dto.customerId);
    const scheduledAt = parseUtcDateTime(dto.date, dto.time);
    const doc = new this.scheduleModel({
      userId,
      customerId: new Types.ObjectId(dto.customerId),
      scheduledAt,
      eventType: dto.eventType,
      note: dto.note,
      googleMeetUrl: dto.googleMeetUrl,
      googleCalendarEventId: dto.googleCalendarEventId,
      status: VentorScheduleEventStatus.Pending,
    });
    const saved = await doc.save();
    if (dto.eventType === VentorScheduleEventType.OnLand) {
      await this.recordCustomSentLandEvent(
        userId,
        dto.customerId,
        saved._id as Types.ObjectId,
        saved.scheduledAt,
      );
    }
    const meetUrl = dto.googleMeetUrl?.trim();
    if (
      dto.eventType === VentorScheduleEventType.Virtual &&
      meetUrl
    ) {
      await this.customerCallLogsService.createGoogleMeetScheduleLog({
        scheduleEventId: String(saved._id),
        customerId: dto.customerId,
        agentUserId: userId,
        scheduledAt: saved.scheduledAt,
        googleMeetUrl: meetUrl,
        googleCalendarEventId: dto.googleCalendarEventId,
        organizerEmail: dto.organizerEmail,
      });
    }
    return saved;
  }

  /**
   * Syncs Meet attendance + transcript into the linked google_meet call log.
   */
  async syncMeetCall(
    userId: string,
    scheduleEventId: string,
    body: SyncVentorMeetCallDto,
  ): Promise<CustomerCallLogAdminItemDto> {
    if (!Types.ObjectId.isValid(scheduleEventId)) {
      throw new NotFoundException('Schedule event not found');
    }
    const doc = await this.scheduleModel.findById(scheduleEventId).exec();
    if (!doc) {
      throw new NotFoundException('Schedule event not found');
    }
    if (doc.userId !== userId) {
      throw new ForbiddenException('Schedule event is not in your scope');
    }
    if (doc.eventType !== VentorScheduleEventType.Virtual) {
      throw new BadRequestException('Meet sync is only for virtual events');
    }
    if (!doc.googleMeetUrl?.trim()) {
      throw new BadRequestException('Schedule event has no Google Meet URL');
    }
    return this.customerCallLogsService.applyGoogleMeetSync({
      scheduleEventId: String(doc._id),
      agentUserId: userId,
      body,
    });
  }

  async findByUserAndDay(
    userId: string,
    dateYmd: string,
  ): Promise<VentorScheduleEventDocument[]> {
    const { start, end } = utcDayRange(dateYmd);
    const rows = await this.scheduleModel
      .find({
        userId,
        scheduledAt: { $gte: start, $lt: end },
      })
      .sort({ scheduledAt: 1 })
      .populate({
        path: 'customerId',
        select: 'name lastName interestedProjects',
      })
      .exec();
    return rows as VentorScheduleEventDocument[];
  }

  async findAllOnLandByDay(
    dateYmd: string,
  ): Promise<VentorScheduleEventDocument[]> {
    const { start, end } = utcDayRange(dateYmd);
    const rows = await this.scheduleModel
      .find({
        eventType: VentorScheduleEventType.OnLand,
        scheduledAt: { $gte: start, $lt: end },
      })
      .sort({ scheduledAt: 1 })
      .populate({
        path: 'customerId',
        select: 'name lastName interestedProjects',
      })
      .exec();
    return rows as VentorScheduleEventDocument[];
  }

  /**
   * All schedule rows for a customer when JWT user may access that customer.
   */
  async findByCustomerForUser(
    userId: string,
    customerId: string,
  ): Promise<VentorScheduleEventDocument[]> {
    await this.assertCustomerAccessible(userId, customerId);
    const rows = await this.scheduleModel
      .find({ customerId: new Types.ObjectId(customerId) })
      .sort({ scheduledAt: -1 })
      .populate({
        path: 'customerId',
        select: 'name lastName interestedProjects',
      })
      .exec();
    return rows as VentorScheduleEventDocument[];
  }

  async updateStatus(
    userId: string,
    eventId: string,
    status: VentorScheduleEventStatus,
  ): Promise<VentorScheduleEventDocument> {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new NotFoundException('Event not found');
    }
    const scheduleObjectId = new Types.ObjectId(eventId);
    const prior = await this.scheduleModel
      .findOne({ _id: scheduleObjectId, userId })
      .select('status eventType customerId scheduledAt')
      .exec();
    if (!prior) {
      throw new NotFoundException('Event not found');
    }
    const updated = await this.scheduleModel
      .findOneAndUpdate(
        { _id: scheduleObjectId, userId },
        { $set: { status } },
        { returnDocument: 'after' },
      )
      .populate<{ customerId: CustomerDocument }>({
        path: 'customerId',
        select: 'name lastName interestedProjects',
      })
      .exec();
    if (!updated) {
      throw new NotFoundException('Event not found');
    }
    const becameCancelled =
      status === VentorScheduleEventStatus.Cancelled &&
      prior.status !== VentorScheduleEventStatus.Cancelled;
    const becameDone =
      status === VentorScheduleEventStatus.Done &&
      prior.status !== VentorScheduleEventStatus.Done;
    await this.emitOnLandStatusCustomerEventsIfNeeded({
      prior,
      actorUserId: userId,
      scheduleObjectId,
      becameCancelled,
      becameDone,
    });
    return updated as unknown as VentorScheduleEventDocument;
  }

  async updateStatusAsMainLead(
    actorUserId: string,
    eventId: string,
    status: VentorScheduleEventStatus,
  ): Promise<VentorScheduleEventDocument> {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new NotFoundException('Event not found');
    }
    const scheduleObjectId = new Types.ObjectId(eventId);
    const prior = await this.scheduleModel
      .findOne({ _id: scheduleObjectId })
      .select('status eventType customerId scheduledAt')
      .exec();
    if (!prior) {
      throw new NotFoundException('Event not found');
    }
    if (prior.eventType !== VentorScheduleEventType.OnLand) {
      throw new ForbiddenException(
        'Only on_land events can be updated by main lead',
      );
    }
    const updated = await this.scheduleModel
      .findOneAndUpdate(
        { _id: scheduleObjectId },
        { $set: { status } },
        { returnDocument: 'after' },
      )
      .populate<{ customerId: CustomerDocument }>({
        path: 'customerId',
        select: 'name lastName interestedProjects',
      })
      .exec();
    if (!updated) {
      throw new NotFoundException('Event not found');
    }
    const becameCancelled =
      status === VentorScheduleEventStatus.Cancelled &&
      prior.status !== VentorScheduleEventStatus.Cancelled;
    const becameDone =
      status === VentorScheduleEventStatus.Done &&
      prior.status !== VentorScheduleEventStatus.Done;
    await this.emitOnLandStatusCustomerEventsIfNeeded({
      prior,
      actorUserId,
      scheduleObjectId,
      becameCancelled,
      becameDone,
    });
    return updated as unknown as VentorScheduleEventDocument;
  }

  private async emitOnLandStatusCustomerEventsIfNeeded(args: {
    readonly prior: {
      eventType: VentorScheduleEventType;
      status: VentorScheduleEventStatus;
      customerId: Types.ObjectId;
      scheduledAt: Date;
    };
    readonly actorUserId: string;
    readonly scheduleObjectId: Types.ObjectId;
    readonly becameCancelled: boolean;
    readonly becameDone: boolean;
  }): Promise<void> {
    console.log('emitOnLandStatusCustomerEventsIfNeeded', JSON.stringify(args, null, 2));
    const {
      prior,
      actorUserId,
      scheduleObjectId,
      becameCancelled,
      becameDone,
    } = args;
    if (
      prior.eventType !== VentorScheduleEventType.OnLand ||
      (!becameCancelled && !becameDone)
    ) {
      return;
    }
    const customerIdStr = String(prior.customerId);
    if (becameCancelled) {
      await this.recordOnLandStatusCustomerEvent({
        userId: actorUserId,
        customerId: customerIdStr,
        scheduleId: scheduleObjectId,
        scheduledAt: prior.scheduledAt,
        eventType: 'CUSTOMER_CANCELLED_VISIT_LAND',
        description: ON_LAND_CUSTOMER_EVENT_DESCRIPTION.visitCancelled,
      });
    }
    if (becameDone) {
      await this.recordOnLandStatusCustomerEvent({
        userId: actorUserId,
        customerId: customerIdStr,
        scheduleId: scheduleObjectId,
        scheduledAt: prior.scheduledAt,
        eventType: 'CUSTOMER_VISIT_LAND',
        description: ON_LAND_CUSTOMER_EVENT_DESCRIPTION.visitCompleted,
      });
    }
  }
}
