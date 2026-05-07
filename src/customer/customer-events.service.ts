import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types, isValidObjectId } from 'mongoose';
import { ListCustomerEventsQueryDto } from './dto/list-customer-events.query.dto';
import {
  CustomerEvent,
  type CustomerEventDocument,
} from './schemas/customer-event.schema';
import { Customer, type CustomerDocument } from './schemas/customer.schema';
import { type CustomerEventListRow } from './types/customer-event-list-row.type';
import {
  type CreateCallCrmEventArgs,
  type CreateEventArgs,
  type CustomerEventItem,
  type ListCustomerEventsResult,
} from './types/customer-events.type';

@Injectable()
export class CustomerEventsService {
  constructor(
    @InjectModel(CustomerEvent.name)
    private readonly customerEventModel: Model<CustomerEventDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
  ) {}

  async createEvent(args: CreateEventArgs): Promise<CustomerEventItem> {
    const customerObjectId = await this.resolveCustomerObjectId(args.customerId);
    const created = await this.customerEventModel.create({
      eventType: args.body.eventType,
      description: args.body.description.trim(),
      score: args.body.score,
      customerId: customerObjectId,
      userId: args.actorUserId,
      officeId: args.officeId,
      metadata: args.body.metadata,
    });
    const occurredAt = this.readDocumentCreatedAt(created);
    await this.executeBumpCustomerLastUpdate(customerObjectId, occurredAt);
    return this.mapItem(created);
  }

  async listByCustomerId(
    customerId: string,
    query: ListCustomerEventsQueryDto,
  ): Promise<ListCustomerEventsResult> {
    const customerObjectId = await this.resolveCustomerObjectId(customerId);
    return this.listInternal({ ...query, customerId: String(customerObjectId) });
  }

  async listAdmin(
    query: ListCustomerEventsQueryDto,
  ): Promise<ListCustomerEventsResult> {
    return this.listInternal(query);
  }

  /**
   * Rebuilds `Customer.lastUpdate` from max `customer_events.createdAt` (backfill / repair).
   */
  async recomputeCustomerLastUpdateFromEvents(args: {
    readonly customerId: string;
    readonly actorUserId: string;
  }): Promise<{ lastUpdate: string | null }> {
    const customerObjectId = await this.resolveCustomerObjectId(args.customerId);
    const customer = await this.customerModel.findById(customerObjectId).lean().exec();
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    const ok =
      customer.createdBy === args.actorUserId ||
      (customer.assignedTo != null && customer.assignedTo === args.actorUserId);
    if (!ok) {
      throw new ForbiddenException('Customer is not in your scope');
    }
    const agg = await this.customerEventModel
      .aggregate<{ maxAt: Date | null }>([
        { $match: { customerId: customerObjectId } },
        { $group: { _id: null, maxAt: { $max: '$createdAt' } } },
      ])
      .exec();
    const maxAt = agg[0]?.maxAt;
    if (maxAt == null || !(maxAt instanceof Date)) {
      await this.customerModel
        .updateOne({ _id: customerObjectId }, { $unset: { lastUpdate: '' } })
        .exec();
      return { lastUpdate: null };
    }
    await this.customerModel
      .updateOne({ _id: customerObjectId }, { $set: { lastUpdate: maxAt } })
      .exec();
    return { lastUpdate: maxAt.toISOString() };
  }

  async createCallCrmEvent(args: CreateCallCrmEventArgs): Promise<void> {
    const customerObjectId = await this.tryResolveCustomerObjectId(args.customerRef);
    if (customerObjectId === null) {
      return;
    }
    const dedupeMetadataKey = 'dedupeKey';
    const dedupeKey = `CALL_CRM:${args.callSid}`;
    const matched = await this.customerEventModel
      .findOne({
        customerId: customerObjectId,
        eventType: 'CALL_CRM',
        [`metadata.${dedupeMetadataKey}`]: dedupeKey,
      })
      .lean()
      .exec();
    if (matched) {
      return;
    }
    const created = await this.customerEventModel.create({
      customerId: customerObjectId,
      eventType: 'CALL_CRM',
      description: args.description ?? 'CRM call created',
      score: undefined,
      userId: args.userId?.trim() ? args.userId : 'system',
      metadata: { [dedupeMetadataKey]: dedupeKey, callSid: args.callSid },
    });
    const occurredAt = this.readDocumentCreatedAt(created);
    await this.executeBumpCustomerLastUpdate(customerObjectId, occurredAt);
  }

  private async listInternal(
    query: ListCustomerEventsQueryDto & { customerId?: string },
  ): Promise<ListCustomerEventsResult> {
    const limit = query.limit ?? 100;
    const skip = query.skip ?? 0;
    const filter: Record<string, unknown> = {};
    if (query.customerId) {
      filter.customerId = new Types.ObjectId(query.customerId);
    }
    if (query.eventType) {
      filter.eventType = query.eventType;
    }
    if (query.officeId?.trim()) {
      filter.officeId = query.officeId.trim();
    }
    if (query.userId?.trim()) {
      filter.userId = query.userId.trim();
    }
    if (query.dateFrom || query.dateTo) {
      const createdAt: { $gte?: Date; $lte?: Date } = {};
      if (query.dateFrom) {
        createdAt.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        createdAt.$lte = new Date(query.dateTo);
      }
      filter.createdAt = createdAt;
    }
    const [docs, total] = await Promise.all([
      this.customerEventModel
        .aggregate<CustomerEventListRow>([
          { $match: filter },
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'customers',
              localField: 'customerId',
              foreignField: '_id',
              as: 'customer',
            },
          },
          {
            $unwind: {
              path: '$customer',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              _id: 1,
              eventType: 1,
              description: 1,
              score: 1,
              customerId: 1,
              customerName: '$customer.name',
              customerLastName: '$customer.lastName',
              userId: 1,
              officeId: 1,
              metadata: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        ])
        .exec(),
      this.customerEventModel.countDocuments(filter).exec(),
    ]);
    return {
      items: docs.map((doc) => this.mapItem(doc)),
      total,
      limit,
      skip,
    };
  }

  /**
   * Sets customer `lastUpdate` to the latest event time (idempotent with $max).
   */
  private async executeBumpCustomerLastUpdate(
    customerObjectId: Types.ObjectId,
    occurredAt: Date,
  ): Promise<void> {
    await this.customerModel
      .updateOne({ _id: customerObjectId }, { $max: { lastUpdate: occurredAt } })
      .exec();
  }

  private readDocumentCreatedAt(doc: CustomerEventDocument): Date {
    const raw = (doc as unknown as { createdAt?: Date }).createdAt;
    return raw instanceof Date ? raw : new Date();
  }

  private async resolveCustomerObjectId(customerId: string): Promise<Types.ObjectId> {
    if (isValidObjectId(customerId)) {
      const objectId = new Types.ObjectId(customerId);
      const exists = await this.customerModel
        .exists({ _id: objectId })
        .exec();
      if (exists) {
        return objectId;
      }
    }
    throw new NotFoundException('Customer not found');
  }

  private async tryResolveCustomerObjectId(
    customerRef: string,
  ): Promise<Types.ObjectId | null> {
    try {
      return await this.resolveCustomerObjectId(customerRef);
    } catch {
      return null;
    }
  }

  private mapItem(doc: CustomerEventDocument | CustomerEventListRow): CustomerEventItem {
    const createdAt = (doc as { createdAt?: Date }).createdAt;
    const updatedAt = (doc as { updatedAt?: Date }).updatedAt;
    return {
      id: String(doc._id),
      eventType: doc.eventType,
      description: doc.description,
      score: doc.score,
      customerId: String(doc.customerId),
      customerName: 'customerName' in doc ? doc.customerName : undefined,
      customerLastName: 'customerLastName' in doc ? doc.customerLastName : undefined,
      userId: doc.userId,
      officeId: doc.officeId,
      metadata: doc.metadata,
      createdAt: (createdAt ?? new Date(0)).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date(0)).toISOString(),
    };
  }
}
