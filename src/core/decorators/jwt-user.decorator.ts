import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { OfficeJwtPayload } from '../types/office-jwt-payload.type';

/**
 * Injects the verified JWT payload set by {@link TokenJwtMiddleware} (`req.officeJwtUser`).
 */
export const JwtUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OfficeJwtPayload | undefined => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.officeJwtUser;
  },
);
