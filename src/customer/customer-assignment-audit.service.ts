import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ListCustomerAssignmentChangesQueryDto } from './dto/list-customer-assignment-changes.query.dto';
import {
  CustomerAssignmentChangeLog,
  CustomerAssignmentChangeLogDocument,
} from './schemas/customer-assignment-change-log.schema';
import {
  type CustomerAssignmentChangeAggRow,
  type CustomerAssignmentChangeItem,
  type ListCustomerAssignmentChangesResult,
} from './types/customer-assignment-audit.type';

@Injectable()
export class CustomerAssignmentAuditService {
  constructor(
    @InjectModel(CustomerAssignmentChangeLog.name)
    private readonly assignmentChangeLogModel: Model<CustomerAssignmentChangeLogDocument>,
  ) {}

  async listAdmin(
    query: ListCustomerAssignmentChangesQueryDto,
  ): Promise<ListCustomerAssignmentChangesResult> {
    const limit = query.limit ?? 100;
    const skip = query.skip ?? 0;
    const assigneeUserId = query.assigneeUserId.trim();
    const dateFrom = new Date(query.dateFrom);
    const dateTo = new Date(query.dateTo);
    const filter: Record<string, unknown> = {
      assignedTo: assigneeUserId,
      createdAt: { $gte: dateFrom, $lte: dateTo },
    };
    const [docs, total, summaryRows] = await Promise.all([
      this.assignmentChangeLogModel
        .aggregate<CustomerAssignmentChangeAggRow>([
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
              customerId: 1,
              action: 1,
              actorUserId: 1,
              createdAt: 1,
              assignedFrom: 1,
              assignedTo: 1,
              attendedAt: 1,
              customerName: '$customer.name',
              customerLastName: '$customer.lastName',
              customerPhone: '$customer.phone',
            },
          },
        ])
        .exec(),
      this.assignmentChangeLogModel.countDocuments(filter).exec(),
      this.assignmentChangeLogModel
        .aggregate<{ attendedCount: number; avgTimeToAttendMs: number | null }>([
          { $match: filter },
          {
            $group: {
              _id: null,
              attendedCount: {
                $sum: {
                  $cond: [{ $ne: [{ $ifNull: ['$attendedAt', null] }, null] }, 1, 0],
                },
              },
              avgTimeToAttendMs: {
                $avg: {
                  $cond: [
                    { $ne: [{ $ifNull: ['$attendedAt', null] }, null] },
                    { $subtract: ['$attendedAt', '$createdAt'] },
                    null,
                  ],
                },
              },
            },
          },
        ])
        .exec(),
    ]);
    const summary = summaryRows[0];
    const avgRaw = summary?.avgTimeToAttendMs;
    return {
      items: docs.map((doc) => this.mapRow(doc)),
      total,
      limit,
      skip,
      attendedCount: summary?.attendedCount ?? 0,
      avgTimeToAttendMs:
        typeof avgRaw === 'number' && Number.isFinite(avgRaw) ? avgRaw : null,
    };
  }

  private mapRow(doc: CustomerAssignmentChangeAggRow): CustomerAssignmentChangeItem {
    const assignedFrom =
      doc.assignedFrom !== undefined && doc.assignedFrom !== null
        ? String(doc.assignedFrom)
        : undefined;
    const assignedTo =
      doc.assignedTo !== undefined && doc.assignedTo !== null
        ? String(doc.assignedTo)
        : undefined;
    const attendedAt =
      doc.attendedAt instanceof Date ? doc.attendedAt.toISOString() : undefined;
    const timeToAttendMs =
      doc.attendedAt instanceof Date
        ? doc.attendedAt.getTime() - doc.createdAt.getTime()
        : undefined;
    return {
      changeLogId: String(doc._id),
      customerId: String(doc.customerId),
      customerName: doc.customerName,
      customerLastName: doc.customerLastName,
      customerPhone: doc.customerPhone,
      occurredAt: doc.createdAt.toISOString(),
      actorUserId: doc.actorUserId,
      assignedFrom: assignedFrom === '' ? undefined : assignedFrom,
      assignedTo: assignedTo === '' ? undefined : assignedTo,
      action: doc.action,
      attendedAt,
      timeToAttendMs,
    };
  }
}
