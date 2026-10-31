import type { Model } from 'mongoose';
import type { CustomerDocument } from '../schemas/customer.schema';
import { buildCustomerPhoneCandidates } from './build-customer-phone-candidates.util';

/**
 * Finds existing customers by CO phone variants (phone / whatsapp).
 * Returns all matches so callers can prefer Meta-linked or oldest.
 */
export async function findCustomersByPhoneCandidates(
  customerModel: Model<CustomerDocument>,
  rawPhone: string,
): Promise<CustomerDocument[]> {
  const candidates = buildCustomerPhoneCandidates(rawPhone);
  if (candidates.length === 0) {
    return [];
  }
  return customerModel
    .find({
      $or: [{ phone: { $in: candidates } }, { whatsapp: { $in: candidates } }],
    })
    .sort({ createdAt: 1 })
    .exec();
}

/**
 * Finds an existing customer by canonical phone or digit-only variants (phone / whatsapp).
 * Prefer {@link findCustomersByPhoneCandidates} when Meta vs WA duplicates need ranking.
 */
export async function findCustomerByPhoneCandidates(
  customerModel: Model<CustomerDocument>,
  canonicalPhone: string,
): Promise<CustomerDocument | null> {
  const matches = await findCustomersByPhoneCandidates(customerModel, canonicalPhone);
  return matches[0] ?? null;
}
