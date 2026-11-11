import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { MetaLeadFormFlowStrategy } from '../meta-lead-forms/types/meta-lead-form-flow-strategy.type';
import { META_LEAD_FORM_FLOW_STRATEGIES } from '../meta-lead-forms/types/meta-lead-form-flow-strategy.type';
import { ListAssignmentTimelineQueryDto } from './dto/list-assignment-timeline-query.dto';
import {
  CustomerAssignmentChangeLog,
  CustomerAssignmentChangeLogDocument,
} from './schemas/customer-assignment-change-log.schema';
import type {
  AssignmentTimelineAggRow,
  AssignmentTimelineEvent,
  AssignmentTimelineResult,
} from './types/assignment-timeline.type';

const DEFAULT_LIMIT = 100;

/**
 * Ventor × time assignment timeline for Meta form + lead-conversation assigns.
 * Dual clocks: `assignedAt` (change-log) and `arrivedAt` (campaign/session/customer).
 */
@Injectable()
export class CustomerAssignmentTimelineService {
  constructor(
    @InjectModel(CustomerAssignmentChangeLog.name)
    private readonly assignmentChangeLogModel: Model<CustomerAssignmentChangeLogDocument>,
  ) {}

  async listTimeline(query: ListAssignmentTimelineQueryDto): Promise<AssignmentTimelineResult> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const dateFrom = new Date(query.dateFrom);
    const dateTo = new Date(query.dateTo);
    const cursorBefore = query.cursorBefore ? new Date(query.cursorBefore) : undefined;
    const createdAtFilter: Record<string, Date> = { $gte: dateFrom, $lte: dateTo };
    if (cursorBefore != null) {
      createdAtFilter.$lt = cursorBefore;
      delete createdAtFilter.$lte;
    }
    const match: Record<string, unknown> = {
      assignedTo: { $nin: [null, ''] },
      createdAt: createdAtFilter,
    };
    if (query.ventorId?.trim()) {
      match.assignedTo = query.ventorId.trim();
    }
    const rows = await this.assignmentChangeLogModel
      .aggregate<AssignmentTimelineAggRow>([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $limit: limit + 1 },
        {
          $lookup: {
            from: 'customers',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
          },
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'meta_lead_campaigns',
            let: { cid: '$customerId' },
            pipeline: [
              { $match: { $expr: { $eq: ['$customerId', '$$cid'] } } },
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
              {
                $project: {
                  flowStrategy: 1,
                  createdAt: 1,
                  gatewayReceivedAt: 1,
                },
              },
            ],
            as: 'campaign',
          },
        },
        {
          $lookup: {
            from: 'lead_conversation_sessions',
            let: { cid: '$customerId' },
            pipeline: [
              { $match: { $expr: { $eq: ['$customerId', '$$cid'] } } },
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
              { $project: { createdAt: 1 } },
            ],
            as: 'session',
          },
        },
        {
          $project: {
            _id: 1,
            customerId: 1,
            assignedTo: 1,
            createdAt: 1,
            attendedAt: 1,
            customerName: '$customer.name',
            customerLastName: '$customer.lastName',
            customerPhone: '$customer.phone',
            customerCreatedAt: '$customer.createdAt',
            campaignFlowStrategy: { $arrayElemAt: ['$campaign.flowStrategy', 0] },
            campaignCreatedAt: { $arrayElemAt: ['$campaign.createdAt', 0] },
            campaignGatewayReceivedAt: { $arrayElemAt: ['$campaign.gatewayReceivedAt', 0] },
            sessionCreatedAt: { $arrayElemAt: ['$session.createdAt', 0] },
          },
        },
      ])
      .exec();
    const filtered = rows
      .map((row) => this.mapRow(row))
      .filter((event) => this.matchesFlowStrategy(event, query.flowStrategy));
    const hasMoreOlder = filtered.length > limit;
    const page = hasMoreOlder ? filtered.slice(0, limit) : filtered;
    const oldest = page.length > 0 ? page[page.length - 1] : undefined;
    return {
      windowFrom: dateFrom.toISOString(),
      windowTo: (cursorBefore ?? dateTo).toISOString(),
      events: page,
      nextCursorBefore: oldest?.assignedAt,
      hasMoreOlder,
    };
  }

  private matchesFlowStrategy(
    event: AssignmentTimelineEvent,
    flowStrategy: MetaLeadFormFlowStrategy | undefined,
  ): boolean {
    if (flowStrategy == null) {
      return true;
    }
    return event.flowStrategy === flowStrategy;
  }

  private mapRow(row: AssignmentTimelineAggRow): AssignmentTimelineEvent {
    const assignedAt = row.createdAt.toISOString();
    const arrivedAt = this.resolveArrivedAt(row).toISOString();
    const flowStrategy = this.resolveFlowStrategy(row.campaignFlowStrategy);
    const attendedAt =
      row.attendedAt instanceof Date ? row.attendedAt.toISOString() : undefined;
    return {
      id: String(row._id),
      ventorId: String(row.assignedTo ?? '').trim(),
      customerId: String(row.customerId),
      customerName: row.customerName,
      customerLastName: row.customerLastName,
      customerPhone: row.customerPhone,
      assignedAt,
      arrivedAt,
      ...(flowStrategy ? { flowStrategy } : {}),
      ...(attendedAt ? { attendedAt } : {}),
    };
  }

  private resolveArrivedAt(row: AssignmentTimelineAggRow): Date {
    const gateway = (row.campaignGatewayReceivedAt ?? '').trim();
    if (gateway.length > 0) {
      const parsed = new Date(gateway);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    if (row.campaignCreatedAt instanceof Date) {
      return row.campaignCreatedAt;
    }
    if (row.sessionCreatedAt instanceof Date) {
      return row.sessionCreatedAt;
    }
    if (row.customerCreatedAt instanceof Date) {
      return row.customerCreatedAt;
    }
    return row.createdAt;
  }

  private resolveFlowStrategy(raw: string | undefined): MetaLeadFormFlowStrategy | undefined {
    if (raw == null) {
      return undefined;
    }
    return (META_LEAD_FORM_FLOW_STRATEGIES as readonly string[]).includes(raw)
      ? (raw as MetaLeadFormFlowStrategy)
      : undefined;
  }
}
