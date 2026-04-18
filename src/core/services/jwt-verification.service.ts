import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OfficeJwtPayload } from '../types/office-jwt-payload.type';

import jwt = require('jsonwebtoken');

if (jwt == null || typeof jwt.verify !== 'function') {
  throw new Error(
    'jsonwebtoken must export verify(); check installation and module resolution',
  );
}

const JWT_ALGORITHM = 'RS256' as const;
const PUBLIC_KEY_CACHE_TTL_MS = 60 * 60 * 1000;
const JWT_OFFICE_BASE_URL_ENV = 'JWT_OFFICE_BASE_URL';
const CRM_BACKEND_URL_ENV = 'CRM_BACKEND_URL';
const JWT_CLOCK_TOLERANCE_SECONDS = 60;
const RSA_PUBLIC_KEY_PEM_PATTERN =
  /^-{5}BEGIN PUBLIC KEY-{5}\s*([\s\S]*?)\s*-{5}END PUBLIC KEY-{5}$/;

function normalizeRsaPublicKeyPem(value: string): string {
  const pem = value.trim().replace(/\r\n/g, '\n');
  const match = pem.match(RSA_PUBLIC_KEY_PEM_PATTERN);
  if (!match) {
    return pem;
  }
  const body = match[1].replace(/\s+/g, '');
  const chunks = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN PUBLIC KEY-----\n${chunks.join('\n')}\n-----END PUBLIC KEY-----`;
}

/**
 * Fetches and caches the office JWT public key, verifies RS256 tokens.
 */
@Injectable()
export class JwtVerificationService {
  private readonly logger = new Logger(JwtVerificationService.name);
  private cachedPublicKey: string | null = null;
  private cachedPublicKeyAtMs = 0;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Verifies a JWT and returns the payload. Throws UnauthorizedException when invalid or expired.
   */
  async verifyToken(token: string): Promise<OfficeJwtPayload> {
    const publicKey = await this.resolvePublicKey();
    try {
      const decoded = jwt.verify(token, publicKey, {
        algorithms: [JWT_ALGORITHM],
        clockTolerance: JWT_CLOCK_TOLERANCE_SECONDS,
      });
      if (typeof decoded === 'string' || decoded === null) {
        throw new UnauthorizedException('Invalid token payload');
      }
      return decoded as OfficeJwtPayload;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Token has expired');
      }
      if (err instanceof jwt.NotBeforeError) {
        throw new UnauthorizedException('Token is not yet valid');
      }
      if (err instanceof jwt.JsonWebTokenError) {
        this.logger.warn(`JWT verification failed: ${err.message}`);
        throw new UnauthorizedException('Invalid token');
      }
      this.logger.error(
        err instanceof Error ? err.message : 'Unknown JWT verify error',
      );
      throw new UnauthorizedException('Invalid token');
    }
  }

  private async resolvePublicKey(): Promise<string> {
    const now = Date.now();
    if (
      this.cachedPublicKey !== null &&
      now - this.cachedPublicKeyAtMs < PUBLIC_KEY_CACHE_TTL_MS
    ) {
      return this.cachedPublicKey;
    }
    const baseUrl = this.resolveOfficeBaseUrl();
    const url = `${baseUrl.replace(/\/+$/, '')}/public/jwt/public-key`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new InternalServerErrorException(
        `Could not load JWT public key (HTTP ${response.status})`,
      );
    }
    const data = (await response.json()) as { publicKey?: string };
    if (!data.publicKey || typeof data.publicKey !== 'string') {
      throw new InternalServerErrorException(
        'JWT public key response is invalid',
      );
    }
    const normalized = normalizeRsaPublicKeyPem(data.publicKey);
    this.cachedPublicKey = normalized;
    this.cachedPublicKeyAtMs = now;
    return normalized;
  }

  private resolveOfficeBaseUrl(): string {
    const explicit = this.configService
      .get<string>(JWT_OFFICE_BASE_URL_ENV)
      ?.trim();
    if (explicit) {
      return explicit;
    }
    const crm = this.configService.get<string>(CRM_BACKEND_URL_ENV)?.trim();
    if (crm) {
      return crm;
    }
    throw new InternalServerErrorException(
      `${JWT_OFFICE_BASE_URL_ENV} or ${CRM_BACKEND_URL_ENV} must be configured`,
    );
  }
}
