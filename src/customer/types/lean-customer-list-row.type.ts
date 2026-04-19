import { Types } from 'mongoose';

/**
 * Lean Mongo document shape for the admin customer list `.select()` projection.
 */
export type LeanCustomerListRow = {
  _id: Types.ObjectId;
  name?: string;
  lastName?: string;
  phone: string;
  email?: string;
  assignedTo?: string;
  enabled?: boolean;
  createdAt?: Date | string;
};
