import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { CreateVentorScheduleEventDto } from './dto/create-ventor-schedule-event.dto';
import { CustomerEventsService } from '../customer/customer-events.service';
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
    return saved;
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
        { new: true },
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
    if (prior.eventType === VentorScheduleEventType.OnLand && (becameCancelled || becameDone)) {
      const customerIdStr = String(prior.customerId);
      if (becameCancelled) {
        await this.recordOnLandStatusCustomerEvent({
          userId,
          customerId: customerIdStr,
          scheduleId: scheduleObjectId,
          scheduledAt: prior.scheduledAt,
          eventType: 'CUSTOMER_CANCELLED_VISIT_LAND',
          description: ON_LAND_CUSTOMER_EVENT_DESCRIPTION.visitCancelled,
        });
      }
      if (becameDone) {
        await this.recordOnLandStatusCustomerEvent({
          userId,
          customerId: customerIdStr,
          scheduleId: scheduleObjectId,
          scheduledAt: prior.scheduledAt,
          eventType: 'CUSTOMER_VISIT_LAND',
          description: ON_LAND_CUSTOMER_EVENT_DESCRIPTION.visitCompleted,
        });
      }
    }
    return updated as unknown as VentorScheduleEventDocument;
  }
}
