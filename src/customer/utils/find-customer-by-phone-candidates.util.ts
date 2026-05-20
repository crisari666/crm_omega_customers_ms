import type { Model } from 'mongoose';
import type { CustomerDocument } from '../schemas/customer.schema';

/**
 * Finds an existing customer by canonical phone or digit-only variants (phone / whatsapp).
 */
export async function findCustomerByPhoneCandidates(
  customerModel: Model<CustomerDocument>,
  canonicalPhone: string,
): Promise<CustomerDocument | null> {
  const digits = canonicalPhone.replace(/\D/g, '');
  const candidates: string[] = [canonicalPhone, digits].filter(
    (value, index, array) => value !== '' && array.indexOf(value) === index,
  );
  if (candidates.length === 0) {
    return null;
  }
  return customerModel
    .findOne({
      $or: [{ phone: { $in: candidates } }, { whatsapp: { $in: candidates } }],
    })
    .exec();
}
