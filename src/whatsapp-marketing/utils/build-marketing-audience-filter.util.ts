import { Types } from 'mongoose';
import type { MarketingAudienceFilter } from '../types/marketing-audience-filter.type';

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeFilterWithClause(
  base: Record<string, unknown>,
  clause: Record<string, unknown>,
): Record<string, unknown> {
  if (Object.keys(base).length === 0) {
    return { ...clause };
  }
  if (base.$and != null && Array.isArray(base.$and)) {
    return { $and: [...base.$and, clause] };
  }
  return { $and: [base, clause] };
}

/**
 * Builds a Mongo match filter for marketing campaign audiences (multi-step support).
 */
export function buildMarketingAudienceFilter(
  filterInput: MarketingAudienceFilter | undefined,
): Record<string, unknown> {
  const query = filterInput ?? {};
  const filter: Record<string, unknown> = {};
  const useDateRange =
    query.omitDateRange !== true &&
    (query.createdFrom !== undefined || query.createdTo !== undefined);
  if (useDateRange) {
    const createdAt: Record<string, Date> = {};
    if (query.createdFrom !== undefined) {
      createdAt.$gte = new Date(query.createdFrom);
    }
    if (query.createdTo !== undefined) {
      createdAt.$lte = new Date(query.createdTo);
    }
    filter.createdAt = createdAt;
  }
  const hasAssignedTo =
    query.assignedTo !== undefined &&
    query.assignedTo !== null &&
    query.assignedTo.trim() !== '';
  const q = query.search?.trim();
  const searchClause =
    q !== undefined && q !== ''
      ? {
          $or: [
            { name: new RegExp(escapeRegex(q), 'i') },
            { lastName: new RegExp(escapeRegex(q), 'i') },
            { email: new RegExp(escapeRegex(q), 'i') },
            { phone: new RegExp(escapeRegex(q), 'i') },
            { document: new RegExp(escapeRegex(q), 'i') },
          ],
        }
      : null;
  const unassignedClause =
    !hasAssignedTo && query.unassignedOnly === true
      ? {
          $or: [
            { assignedTo: { $exists: false } },
            { assignedTo: null },
            { assignedTo: '' },
          ],
        }
      : null;
  if (hasAssignedTo) {
    filter.assignedTo = query.assignedTo!.trim();
    if (searchClause !== null) {
      filter.$or = searchClause.$or;
    }
  } else if (unassignedClause !== null && searchClause !== null) {
    filter.$and = [unassignedClause, searchClause];
  } else if (unassignedClause !== null) {
    filter.$or = unassignedClause.$or;
  } else if (searchClause !== null) {
    filter.$or = searchClause.$or;
  }
  const stepIds = (query.customerStepIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (stepIds.length === 1) {
    filter.customerStepId = new Types.ObjectId(stepIds[0]);
  } else if (stepIds.length > 1) {
    filter.customerStepId = { $in: stepIds.map((id) => new Types.ObjectId(id)) };
  }
  const enabledClause =
    query.enabled === true
      ? { $or: [{ enabled: true }, { enabled: { $exists: false } }] }
      : query.enabled === false
        ? { enabled: false }
        : null;
  let result = filter;
  if (enabledClause !== null) {
    result = mergeFilterWithClause(result, enabledClause);
  }
  if (query.isReferral !== undefined) {
    result = mergeFilterWithClause(result, { isReferral: query.isReferral });
  }
  result = mergeFilterWithClause(result, {
    phone: { $exists: true, $nin: [null, ''] },
  });
  return result;
}
