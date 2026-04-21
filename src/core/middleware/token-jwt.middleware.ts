import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { JwtVerificationService } from '../services/jwt-verification.service';

const CUSTOMER_PREFIX = '/customer';
const VOICE_WEBHOOK_PREFIX = '/customers-rest/webhooks/voice/calls';
const BEARER_PREFIX_REGEX = /^Bearer\s+/i;

function extractRawJwt(value: string): string {
  const trimmed = value.trim();
  if (BEARER_PREFIX_REGEX.test(trimmed)) {
    return trimmed.replace(BEARER_PREFIX_REGEX, '').trim();
  }
  return trimmed;
}

/**
 * Requires a valid JWT in the `TOKEN` header for `/customer/*`, except `GET /customer/test`.
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
    if (this.isVoiceWebhookRequest(req)) {
      this.validateVoiceWebhookToken(req);
      next();
      return;
    }
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
    const pathname = this.extractPathname(req.originalUrl);
    if (!pathname.startsWith(CUSTOMER_PREFIX)) {
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

  private isVoiceWebhookRequest(req: Request): boolean {
    const pathname = this.extractPathname(req.originalUrl);
    console.log('pathname', pathname);
    return pathname.startsWith(VOICE_WEBHOOK_PREFIX);
  }

  private validateVoiceWebhookToken(req: Request): void {
    const expectedToken: string = this.normalizeToken(
      process.env.VOICE_WEBHOOK_TOKEN,
    );
    const rawHeader = req.headers['x-voice-webhook-token'];
    console.log('rawHeader', rawHeader);
    const receivedToken: string = this.normalizeToken(
      typeof rawHeader === 'string'
        ? rawHeader
        : Array.isArray(rawHeader)
          ? (rawHeader[0] ?? '')
          : '',
    );
    if (expectedToken === '') {
      throw new UnauthorizedException('VOICE_WEBHOOK_TOKEN is not configured');
    }
    if (receivedToken !== expectedToken) {
      throw new UnauthorizedException('Invalid voice webhook token');
    }
  }

  private normalizeToken(rawValue: string | undefined): string {
    const value = (rawValue ?? '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1).trim();
    }
    return value;
  }

  private extractPathname(originalUrl: string): string {
    const questionIndex = originalUrl.indexOf('?');
    const path =
      questionIndex === -1
        ? originalUrl
        : originalUrl.slice(0, questionIndex);
    return path === '' ? '/' : path;
  }
}
