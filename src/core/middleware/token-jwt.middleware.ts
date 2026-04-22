import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { JwtVerificationService } from '../services/jwt-verification.service';

const GLOBAL_API_PREFIX = '/customers-rest';
const CUSTOMER_PREFIX = '/customer';
const VENTOR_SCHEDULE_PREFIX = '/ventor-schedule';
const BEARER_PREFIX_REGEX = /^Bearer\s+/i;

function normalizeApiPathname(originalUrl: string): string {
  const pathname = extractPathname(originalUrl);
  if (pathname.startsWith(GLOBAL_API_PREFIX)) {
    return pathname.slice(GLOBAL_API_PREFIX.length) || '/';
  }
  return pathname;
}

function extractPathname(originalUrl: string): string {
  const questionIndex = originalUrl.indexOf('?');
  const path =
    questionIndex === -1
      ? originalUrl
      : originalUrl.slice(0, questionIndex);
  return path === '' ? '/' : path;
}

function extractRawJwt(value: string): string {
  const trimmed = value.trim();
  if (BEARER_PREFIX_REGEX.test(trimmed)) {
    return trimmed.replace(BEARER_PREFIX_REGEX, '').trim();
  }
  return trimmed;
}

/**
 * Requires a valid JWT in the `TOKEN` header for `/customer/*` and `/ventor-schedule/*`
 * (after optional global prefix `/customers-rest`), except `GET /customer/test`.
 */
@Injectable()
export class TokenJwtMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtVerificationService: JwtVerificationService,
  ) {}

  async use(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (this.shouldBypass(req)) {
      next();
      return;
    }
    const rawHeader = req.headers['token'];
    const raw =
      typeof rawHeader === 'string'
        ? rawHeader
        : Array.isArray(rawHeader)
          ? (rawHeader[0] ?? '')
          : '';
    const token = extractRawJwt(raw);
    if (token === '') {
      throw new UnauthorizedException('TOKEN header is required');
    }
    const payload = await this.jwtVerificationService.verifyToken(token);
    req.officeJwtUser = payload;
    next();
  }

  private shouldBypass(req: Request): boolean {
    if (req.method === 'OPTIONS') {
      return true;
    }
    const pathname = normalizeApiPathname(req.originalUrl);
    const isCustomer = pathname.startsWith(CUSTOMER_PREFIX);
    const isVentorSchedule = pathname.startsWith(VENTOR_SCHEDULE_PREFIX);
    if (!isCustomer && !isVentorSchedule) {
      return true;
    }
    const normalized =
      pathname.length > 1 && pathname.endsWith('/')
        ? pathname.slice(0, -1)
        : pathname;
    if (req.method === 'GET' && normalized === `${CUSTOMER_PREFIX}/test`) {
      return true;
    }
    return false;
  }
}
