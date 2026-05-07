import { Types } from 'mongoose';
import type { CustomerEventType } from '../schemas/customer-event.schema';

/**
 * Lean row returned by the admin/list events aggregation
 * (`customer_events` joined with `customers` via `$lookup`).
 */
export type CustomerEventListRow = {
  readonly _id: Types.ObjectId;
  readonly eventType: CustomerEventType;
  readonly description: string;
  readonly score?: number;
  readonly customerId: Types.ObjectId;
  readonly customerName?: string;
  readonly customerLastName?: string;
  readonly userId: string;
  readonly officeId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
};
