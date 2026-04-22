import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { CreateVentorScheduleEventDto } from './dto/create-ventor-schedule-event.dto';
import {
  VentorScheduleEvent,
  VentorScheduleEventDocument,
  VentorScheduleEventStatus,
} from './schemas/ventor-schedule-event.schema';

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
    return doc.save();
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
    const updated = await this.scheduleModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(eventId), userId },
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
    return updated as unknown as VentorScheduleEventDocument;
  }
}
