import { ForbiddenException } from '@nestjs/common';
import { OFFICE_USER_LEVEL_MAIN_LEAD } from '../constants/office-user-level.constant';
import type { OfficeJwtPayload } from '../types/office-jwt-payload.type';

/**
 * Ensures JWT carries office user level main lead (cross-ventor schedule access).
 */
export function assertOfficeMainLead(
  payload: OfficeJwtPayload | undefined,
): void {
  if (payload?.level !== OFFICE_USER_LEVEL_MAIN_LEAD) {
    throw new ForbiddenException('Main lead access required');
  }
}
