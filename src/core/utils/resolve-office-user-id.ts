import { UnauthorizedException } from '@nestjs/common';
import type { OfficeJwtPayload } from '../types/office-jwt-payload.type';

/**
 * Returns the authenticated office user id from the JWT payload (`userId`, else `sub`).
 */
export function resolveOfficeUserId(
  payload: OfficeJwtPayload | undefined,
): string {
  if (payload == null) {
    throw new UnauthorizedException('Missing JWT context');
  }
  const id = payload.userId ?? payload.sub;
  if (id == null || id.trim() === '') {
    throw new UnauthorizedException('JWT payload has no user identifier');
  }
  return id;
}
