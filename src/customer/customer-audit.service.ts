import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CustomerChangeEntry,
  CustomerChangeLog,
  CustomerChangeLogDocument,
} from './schemas/customer-change-log.schema';
import {
  CustomerAssignmentChangeLog,
  CustomerAssignmentChangeLogDocument,
} from './schemas/customer-assignment-change-log.schema';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { CustomerAssignmentPushService } from './customer-assignment-push.service';

const AUDIT_SNAPSHOT_KEY = '__customerAuditSnapshot';
const AUDIT_WAS_NEW_KEY = '__customerAuditWasNew';
export const ASSIGNMENT_CHANGE_LOGGED_KEY = '__assignmentChangeLogged';

const IGNORED_DIFF_FIELDS = new Set([
  'updatedAt',
  '__v',
  '_id',
  'description',
  'customerStepId',
]);

/**
 * Persists append-only change history for customers (save hooks + explicit service calls).
 */
@Injectable()
export class CustomerAuditService {
  private hooksAttached = false;

  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerChangeLog.name)
    private readonly changeLogModel: Model<CustomerChangeLogDocument>,
    @InjectModel(CustomerAssignmentChangeLog.name)
    private readonly assignmentChangeLogModel: Model<CustomerAssignmentChangeLogDocument>,
    private readonly assignmentPushService: CustomerAssignmentPushService,
  ) {}

  /**
   * Registers pre/post save hooks on the Customer schema (idempotent).
   */
  attachCustomerSchemaHooks(): void {
    if (this.hooksAttached) {
      return;
    }
    this.hooksAttached = true;
    const schema = this.customerModel.schema;
    const stashBaseline = (doc: CustomerDocument): void => {
      doc.$locals[AUDIT_SNAPSHOT_KEY] = doc.toObject({ depopulate: true });
    };
    schema.post('init', function () {
      stashBaseline(this);
    });
    schema.post('findOne', function (doc: CustomerDocument | null) {
      if (doc != null) {
        stashBaseline(doc);
      }
    });
    schema.post('find', function (docs: CustomerDocument[]) {
      docs.forEach((doc) => stashBaseline(doc));
    });
    schema.pre('save', function (next) {
      this.$locals[AUDIT_WAS_NEW_KEY] = this.isNew;
      next();
    });
    const self = this;
    schema.post('save', function (doc: CustomerDocument) {
      void self.persistSaveAudit(doc);
    });
  }

  /**
   * Logs updates performed via `findOneAndUpdate` / `findByIdAndUpdate` (no save hook diff).
   */
  async recordArrayOrQueryUpdate(params: {
    readonly customerId: string;
    readonly actorUserId?: string;
    readonly summaryField: string;
    readonly from: unknown;
    readonly to: unknown;
  }): Promise<void> {
    const changes: CustomerChangeEntry[] = [
      {
        field: params.summaryField,
        from: params.from,
        to: params.to,
      },
    ];
    await new this.changeLogModel({
      customerId: new Types.ObjectId(params.customerId),
      actorUserId: params.actorUserId,
      action: 'update',
      changes,
    }).save();
    if (params.summaryField === 'assignedTo') {
      await this.recordAssignmentChange({
        customerId: params.customerId,
        actorUserId: params.actorUserId,
        action: 'update',
        assignedFrom: this.normalizeAssigneeValue(params.from),
        assignedTo: this.normalizeAssigneeValue(params.to),
      });
    }
  }

  private async persistSaveAudit(doc: CustomerDocument): Promise<void> {
    const wasNew = doc.$locals[AUDIT_WAS_NEW_KEY] === true;
    const snapshot = doc.$locals[AUDIT_SNAPSHOT_KEY] as
      | Record<string, unknown>
      | undefined;
    const actorUserId = doc.$locals['__auditActorUserId'] as string | undefined;
    const after = doc.toObject({ depopulate: true }) as Record<string, unknown>;
    if (wasNew) {
      const changes = this.buildCreateChanges(after);
      if (changes.length === 0) {
        return;
      }
      await new this.changeLogModel({
        customerId: doc._id,
        actorUserId,
        action: 'create',
        changes,
      }).save();
      const initialAssignee = this.normalizeAssigneeValue(after.assignedTo);
      if (initialAssignee !== undefined) {
        await this.recordAssignmentChange({
          customerId: String(doc._id),
          actorUserId,
          action: 'create',
          assignedFrom: undefined,
          assignedTo: initialAssignee,
        });
      }
      return;
    }
    if (!snapshot) {
      return;
    }
    const changes = this.diffObjects(snapshot, after);
    if (changes.length === 0) {
      return;
    }
    await new this.changeLogModel({
      customerId: doc._id,
      actorUserId,
      action: 'update',
      changes,
    }).save();
    const assignmentChange = changes.find((entry) => entry.field === 'assignedTo');
    if (
      assignmentChange !== undefined &&
      doc.$locals[ASSIGNMENT_CHANGE_LOGGED_KEY] !== true
    ) {
      await this.recordAssignmentChange({
        customerId: String(doc._id),
        actorUserId,
        action: 'update',
        assignedFrom: this.normalizeAssigneeValue(assignmentChange.from),
        assignedTo: this.normalizeAssigneeValue(assignmentChange.to),
      });
    }
  }

  /**
   * Persists a row in `CustomerAssignmentChangeLog` (used by assignee API and query updates).
   */
  async recordCustomerAssignmentChange(params: {
    readonly customerId: string;
    readonly actorUserId?: string;
    readonly action: 'create' | 'update';
    readonly assignedFrom?: unknown;
    readonly assignedTo?: unknown;
  }): Promise<void> {
    await this.recordAssignmentChange({
      customerId: params.customerId,
      actorUserId: params.actorUserId,
      action: params.action,
      assignedFrom: this.normalizeAssigneeValue(params.assignedFrom),
      assignedTo: this.normalizeAssigneeValue(params.assignedTo),
    });
  }

  /**
   * Marks the latest open assignment log row as attended when the assignee creates an event/call.
   * Idempotent: only sets `attendedAt` when still unset.
   */
  async markAssignmentAttendedIfNeeded(params: {
    readonly customerId: string | Types.ObjectId;
    readonly actorUserId: string;
    readonly attendedAt?: Date;
  }): Promise<void> {
    const actorUserId = params.actorUserId.trim();
    if (actorUserId === '' || actorUserId === 'system') {
      return;
    }
    const customerObjectId =
      params.customerId instanceof Types.ObjectId
        ? params.customerId
        : Types.ObjectId.isValid(params.customerId)
          ? new Types.ObjectId(params.customerId)
          : null;
    if (customerObjectId === null) {
      return;
    }
    const attendedAt = params.attendedAt ?? new Date();
    await this.assignmentChangeLogModel
      .findOneAndUpdate(
        {
          customerId: customerObjectId,
          assignedTo: actorUserId,
          attendedAt: null,
          createdAt: { $lte: attendedAt },
        },
        { $set: { attendedAt } },
        { sort: { createdAt: -1 } },
      )
      .exec();
  }

  private async recordAssignmentChange(params: {
    readonly customerId: string;
    readonly actorUserId?: string;
    readonly action: 'create' | 'update';
    readonly assignedFrom?: string;
    readonly assignedTo?: string;
  }): Promise<void> {
    const from = params.assignedFrom;
    const to = params.assignedTo;
    if (from === to) {
      return;
    }
    await new this.assignmentChangeLogModel({
      customerId: new Types.ObjectId(params.customerId),
      actorUserId: params.actorUserId,
      action: params.action,
      assignedFrom: from,
      assignedTo: to,
    }).save();
    void this.assignmentPushService.executeNotifyAssignmentChange({
      customerId: params.customerId,
      assignedFrom: from,
      assignedTo: to,
    });
  }

  private buildCreateChanges(
    doc: Record<string, unknown>,
  ): CustomerChangeEntry[] {
    const keys = Object.keys(doc).filter(
      (k) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(k),
    );
    return keys.map((field) => ({
      field,
      from: undefined,
      to: doc[field],
    }));
  }

  private diffObjects(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): CustomerChangeEntry[] {
    const changes: CustomerChangeEntry[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (IGNORED_DIFF_FIELDS.has(key)) {
        continue;
      }
      const a = before[key];
      const b = after[key];
      const from = key === 'assignedTo' ? this.normalizeAssigneeValue(a) : a;
      const to = key === 'assignedTo' ? this.normalizeAssigneeValue(b) : b;
      if (this.isSameValue(from, to)) {
        continue;
      }
      changes.push({ field: key, from, to });
    }
    return changes;
  }

  private normalizeAssigneeValue(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const trimmed = String(value).trim();
    return trimmed === '' ? undefined : trimmed;
  }

  private isSameValue(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }
    if (
      typeof a === 'string' &&
      typeof b === 'string' &&
      a.trim() === b.trim()
    ) {
      return true;
    }
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    if (a instanceof Types.ObjectId && b instanceof Types.ObjectId) {
      return a.equals(b);
    }
    if (
      a &&
      b &&
      typeof a === 'object' &&
      typeof b === 'object' &&
      'toString' in a &&
      'toString' in b &&
      String(a) === String(b)
    ) {
      return true;
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }
}
