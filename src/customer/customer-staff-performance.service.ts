import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, PipelineStage, Types } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import {
  CustomerCallLog,
  CustomerCallLogDocument,
} from './schemas/customer-call-log.schema';
import {
  CustomerStep,
  CustomerStepDocument,
} from '../customer-steps/schemas/customer-step.schema';
import type { StaffPerformanceBodyDto } from './dto/staff-performance.body.dto';
import type { CustomerStaffPerformanceReportDto } from './types/customer-staff-performance.type';

/**
 * JavaScript body for MongoDB `$function` — mirrors {@link deriveResolvedCallOutcome} / event helpers.
 * Keep in sync with `src/customer/utils/call-log-outcome.util.ts`.
 */
const RESOLVE_CALL_OUTCOME_FUNCTION = `function(events, headerStatus) {
  function mapTwilioStatusString(status) {
    if (!status) return 'unknown';
    var s = String(status).toLowerCase();
    if (s.indexOf('busy') !== -1) return 'busy';
    if (s.indexOf('no-answer') !== -1 || s.indexOf('no_answer') !== -1) return 'no_answer';
    if (s.indexOf('failed') !== -1) return 'failed';
    if (s.indexOf('canceled') !== -1 || s.indexOf('cancelled') !== -1) return 'canceled';
    if (s.indexOf('completed') !== -1 || s === 'answered') return 'answered';
    if (s.indexOf('ringing') !== -1) return 'ringing';
    if (s.indexOf('in-progress') !== -1 || s.indexOf('queued') !== -1 || s.indexOf('init') !== -1) return 'in_progress';
    return 'unknown';
  }
  function eventTypeToOutcome(type, fallbackStatus) {
    if (!type || type === 'transcription-updated') return mapTwilioStatusString(fallbackStatus);
    if (type === 'answered') return 'answered';
    if (type === 'busy') return 'busy';
    if (type === 'no-answer') return 'no_answer';
    if (type === 'failed') return 'failed';
    if (type === 'canceled') return 'canceled';
    if (type === 'ringing') return 'ringing';
    if (type === 'initiated' || type === 'created') return 'in_progress';
    if (type === 'completed') return mapTwilioStatusString(fallbackStatus);
    return 'unknown';
  }
  if (!events || events.length === 0) return mapTwilioStatusString(headerStatus);
  var sorted = events.slice().sort(function(a, b) {
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
  var lastCompleteIndex = -1;
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].eventType === 'completed') lastCompleteIndex = i;
  }
  if (lastCompleteIndex === -1) {
    var tail = sorted[sorted.length - 1];
    return eventTypeToOutcome(tail.eventType, tail.status || headerStatus);
  }
  if (lastCompleteIndex === 0) return mapTwilioStatusString(headerStatus);
  var before = sorted[lastCompleteIndex - 1];
  return eventTypeToOutcome(before.eventType, before.status || headerStatus);
}`;

type StaffMemberInput = { userId: string; displayName: string };

/**
 * Builds staff performance report from an explicit staff id list + one MongoDB aggregate on customers-ms.
 */
@Injectable()
export class CustomerStaffPerformanceService {
  private readonly logger = new Logger(CustomerStaffPerformanceService.name);

  constructor(
    @InjectConnection()
    private readonly mongoConnection: Connection,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerCallLog.name)
    private readonly customerCallLogModel: Model<CustomerCallLogDocument>,
    @InjectModel(CustomerStep.name)
    private readonly customerStepModel: Model<CustomerStepDocument>,
  ) {}

  async getReport(body: StaffPerformanceBodyDto): Promise<CustomerStaffPerformanceReportDto> {
    const assignedFrom = new Date(body.assignedFrom);
    const assignedTo = new Date(body.assignedTo);
    const callFrom = body.callFrom !== undefined ? new Date(body.callFrom) : assignedFrom;
    const callTo = body.callTo !== undefined ? new Date(body.callTo) : assignedTo;
    const stepsMetaRows = await this.customerStepModel
      .find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .select({ _id: 1, name: 1, order: 1 })
      .lean()
      .exec();
    const stepsMeta = stepsMetaRows.map((row) => ({
      id: String(row._id),
      name: String(row.name ?? ''),
      order: Number(row.order ?? 0),
    }));
    const stepObjectIds = stepsMetaRows.map((row) => row._id as Types.ObjectId);
    const staff = this.buildStaffMembersFromBody(body);
    if (staff.length === 0) {
      return {
        assignedFrom: body.assignedFrom,
        assignedTo: body.assignedTo,
        stepsMeta,
        rows: [],
      };
    }
    const customerColl = this.customerModel.collection.name;
    const callColl = this.customerCallLogModel.collection.name;
    const documents = staff.map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      rangeStart: assignedFrom,
      rangeEnd: assignedTo,
      callRangeStart: callFrom,
      callRangeEnd: callTo,
    }));
    const stepCountsExpr = this.buildStepCountsExpression(stepObjectIds);
    const pipeline: PipelineStage[] = [
      { $documents: documents },
      {
        $lookup: {
          from: customerColl,
          let: {
            uid: '$userId',
            rs: '$rangeStart',
            re: '$rangeEnd',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$assignedTo', '$$uid'] },
                    { $ne: [{ $ifNull: ['$assignedDate', ''] }, ''] },
                    {
                      $let: {
                        vars: {
                          ad: {
                            $dateFromString: {
                              dateString: '$assignedDate',
                              onError: null,
                              onNull: null,
                            },
                          },
                        },
                        in: {
                          $and: [
                            { $ne: ['$$ad', null] },
                            { $gte: ['$$ad', '$$rs'] },
                            { $lte: ['$$ad', '$$re'] },
                          ],
                        },
                      },
                    },
                    {
                      $ne: [{ $ifNull: ['$enabled', true] }, false],
                    },
                  ],
                },
              },
            },
          ],
          as: 'assignedCustomers',
        },
      },
      {
        $addFields: {
          totalAssignedInRange: { $size: '$assignedCustomers' },
          steps: stepCountsExpr,
        },
      },
      {
        $lookup: {
          from: callColl,
          let: {
            uid: '$userId',
            crs: '$callRangeStart',
            cre: '$callRangeEnd',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$agentExternalRef', '$$uid'] },
                    { $gte: ['$createdAt', '$$crs'] },
                    { $lte: ['$createdAt', '$$cre'] },
                  ],
                },
              },
            },
            {
              $addFields: {
                resolvedOutcome: {
                  $function: {
                    body: RESOLVE_CALL_OUTCOME_FUNCTION,
                    args: ['$events', '$status'],
                    lang: 'js',
                  },
                },
              },
            },
            {
              $group: {
                _id: null,
                totalCalls: { $sum: 1 },
                answered: {
                  $sum: {
                    $cond: [{ $eq: ['$resolvedOutcome', 'answered'] }, 1, 0],
                  },
                },
                failed: {
                  $sum: {
                    $cond: [{ $eq: ['$resolvedOutcome', 'failed'] }, 1, 0],
                  },
                },
                dontAnswered: {
                  $sum: {
                    $cond: [
                      {
                        $in: [
                          '$resolvedOutcome',
                          [
                            'no_answer',
                            'busy',
                            'canceled',
                            'ringing',
                            'unknown',
                            'in_progress',
                          ],
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          as: '_callAgg',
        },
      },
      {
        $addFields: {
          calls: {
            $let: {
              vars: { c: { $arrayElemAt: ['$_callAgg', 0] } },
              in: {
                totalCalls: { $ifNull: ['$$c.totalCalls', 0] },
                answered: { $ifNull: ['$$c.answered', 0] },
                dontAnswered: { $ifNull: ['$$c.dontAnswered', 0] },
                failed: { $ifNull: ['$$c.failed', 0] },
              },
            },
          },
        },
      },
      {
        $project: {
          userId: 1,
          displayName: 1,
          totalAssignedInRange: 1,
          steps: 1,
          calls: 1,
        },
      },
    ];
    let rowsRaw: Array<{
      userId: string;
      displayName: string;
      totalAssignedInRange: number;
      steps: Record<string, number>;
      calls: {
        totalCalls: number;
        answered: number;
        dontAnswered: number;
        failed: number;
      };
    }>;
    const nativeDb = this.mongoConnection.db;
    if (nativeDb == null) {
      throw new InternalServerErrorException('MongoDB connection is not ready');
    }
    try {
      rowsRaw = (await nativeDb.aggregate(pipeline as never[]).toArray()) as typeof rowsRaw;
    } catch (err) {
      this.logger.error(
        err instanceof Error ? err.message : 'aggregate staff-performance failed',
      );
      throw new InternalServerErrorException(
        'Staff performance aggregate failed (MongoDB 5.1+ required: $documents runs on db.aggregate; $function for call outcomes)',
      );
    }
    const rows = rowsRaw.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      totalAssignedInRange: row.totalAssignedInRange,
      calls: row.calls,
      steps: row.steps ?? {},
    }));
    return {
      assignedFrom: body.assignedFrom,
      assignedTo: body.assignedTo,
      stepsMeta,
      rows,
    };
  }

  private buildStaffMembersFromBody(body: StaffPerformanceBodyDto): StaffMemberInput[] {
    const labels = body.userDisplayNames ?? {};
    const seen = new Set<string>();
    const out: StaffMemberInput[] = [];
    for (const rawId of body.userIds) {
      const userId = rawId.trim();
      if (seen.has(userId)) {
        continue;
      }
      seen.add(userId);
      const fromMap = labels[userId] ?? labels[rawId];
      const displayName =
        typeof fromMap === 'string' && fromMap.trim().length > 0 ? fromMap.trim() : userId;
      out.push({ userId, displayName });
    }
    return out;
  }

  private buildStepCountsExpression(
    stepObjectIds: Types.ObjectId[],
  ): Record<string, unknown> {
    if (stepObjectIds.length === 0) {
      return { $literal: {} };
    }
    return {
      $arrayToObject: {
        $map: {
          input: stepObjectIds,
          as: 's',
          in: {
            k: { $toString: '$$s' },
            v: {
              $size: {
                $filter: {
                  input: '$assignedCustomers',
                  as: 'c',
                  cond: {
                    $and: [
                      { $ne: ['$$c.customerStepId', null] },
                      { $eq: ['$$c.customerStepId', '$$s'] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    };
  }
}
