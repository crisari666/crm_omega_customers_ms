import { Types } from 'mongoose';
import type { ListCustomersAdminQueryDto } from '../dto/list-customers-admin.query.dto';

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeFilterWithClause(
  base: Record<string, unknown>,
  clause: Record<string, unknown>,
): Record<string, unknown> {
  if (Object.keys(base).length === 0) {
    return clause;
  }
  return { $and: [base, clause] };
}

/**
 * Builds a Mongo match filter for admin customer list queries.
 */
export function buildAdminListFilter(
  query: ListCustomersAdminQueryDto,
): Record<string, unknown> {
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
  const assignedToInIds = (query.assignedToIn ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const hasAssignedToIn = !hasAssignedTo && assignedToInIds.length > 0;
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
    !hasAssignedTo && !hasAssignedToIn && query.unassignedOnly === true
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
  } else if (hasAssignedToIn) {
    filter.assignedTo = { $in: assignedToInIds };
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
  const stepId = query.customerStepId?.trim();
  if (stepId !== undefined && stepId !== '') {
    filter.customerStepId = new Types.ObjectId(stepId);
  }
  const createdBy = query.createdBy?.trim();
  if (createdBy !== undefined && createdBy !== '') {
    filter.createdBy = createdBy;
  }
  const enabledClause =
    query.enabled === true
      ? {
          $or: [{ enabled: true }, { enabled: { $exists: false } }],
        }
      : query.enabled === false
        ? { enabled: false }
        : null;
  if (enabledClause !== null) {
    const withEnabled = mergeFilterWithClause(filter, enabledClause);
    if (query.isReferral !== undefined) {
      return mergeFilterWithClause(withEnabled, {
        isReferral: query.isReferral,
      });
    }
    return withEnabled;
  }
  if (query.isReferral !== undefined) {
    return mergeFilterWithClause(filter, {
      isReferral: query.isReferral,
    });
  }
  return filter;
}
