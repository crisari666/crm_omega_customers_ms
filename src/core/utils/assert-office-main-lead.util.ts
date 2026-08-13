import { ForbiddenException } from '@nestjs/common';
import {
  OFFICE_USER_LEVEL_ADMIN,
  OFFICE_USER_LEVEL_MAIN_LEAD,
  OFFICE_USER_LEVEL_SUBADMIN,
} from '../constants/office-user-level.constant';
import type { OfficeJwtPayload } from '../types/office-jwt-payload.type';

/**
 * Ensures JWT level is admin, subadmin, or commercialDirector (on-land coordinators).
 */
export function assertOfficeOnLandCoordinator(
  payload: OfficeJwtPayload | undefined,
): void {
  if (!isOfficeOnLandCoordinator(payload)) {
    throw new ForbiddenException('On-land coordinator access required');
  }
}

/**
 * @deprecated Prefer {@link assertOfficeOnLandCoordinator}; kept for call sites.
 */
export function assertOfficeMainLead(
  payload: OfficeJwtPayload | undefined,
): void {
  assertOfficeOnLandCoordinator(payload);
}

/**
 * Returns true when JWT level may coordinate on-land visits.
 */
export function isOfficeOnLandCoordinator(
  payload: OfficeJwtPayload | undefined,
): boolean {
  const level = payload?.level;
  return (
    level === OFFICE_USER_LEVEL_ADMIN ||
    level === OFFICE_USER_LEVEL_SUBADMIN ||
    level === OFFICE_USER_LEVEL_MAIN_LEAD
  );
}
