import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CustomerChangeEntry,
  CustomerChangeLog,
  CustomerChangeLogDocument,
} from './schemas/customer-change-log.schema';
import { Customer, CustomerDocument } from './schemas/customer.schema';

const AUDIT_SNAPSHOT_KEY = '__customerAuditSnapshot';
const AUDIT_WAS_NEW_KEY = '__customerAuditWasNew';

const IGNORED_DIFF_FIELDS = new Set([
  'updatedAt',
  '__v',
  '_id',
  'description',
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
    schema.pre('save', function (next) {
      this.$locals[AUDIT_WAS_NEW_KEY] = this.isNew;
      if (!this.isNew) {
        this.$locals[AUDIT_SNAPSHOT_KEY] = this.toObject({ depopulate: true });
      }
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
      if (this.isSameValue(a, b)) {
        continue;
      }
      changes.push({ field: key, from: a, to: b });
    }
    return changes;
  }

  private isSameValue(a: unknown, b: unknown): boolean {
    if (a === b) {
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
