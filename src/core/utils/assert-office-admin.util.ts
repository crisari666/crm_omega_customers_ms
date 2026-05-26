import { ForbiddenException } from '@nestjs/common';
import { OFFICE_USER_LEVEL_ADMIN } from '../constants/office-user-level.constant';
import type { OfficeJwtPayload } from '../types/office-jwt-payload.type';

/**
 * Ensures JWT carries CRM main admin level (UserLevel.admin = 0).
 */
export function assertOfficeAdmin(payload: OfficeJwtPayload | undefined): void {
  if (payload?.level !== OFFICE_USER_LEVEL_ADMIN) {
    throw new ForbiddenException('CRM admin access required');
  }
}
