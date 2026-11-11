import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { resolveMeetAuditSaRelativePath } from './google-meet-audit.constants';

export type MeetAuditServiceAccountCredentials = {
  readonly clientEmail: string;
  readonly privateKey: string;
};

/**
 * Resolves a Meet-audit SA JSON path (relative to cwd or absolute).
 */
export function resolveMeetAuditSaKeyPath(): string {
  const configuredPath = resolveMeetAuditSaRelativePath();
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
}

/**
 * Loads Meet-audit SA credentials from configured JSON path, then env fallbacks.
 */
export function loadMeetAuditServiceAccountCredentials(): MeetAuditServiceAccountCredentials {
  const keyPath = resolveMeetAuditSaKeyPath();
  if (fs.existsSync(keyPath)) {
    const parsed = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as {
      client_email?: string;
      private_key?: string;
    };
    if (parsed.client_email && parsed.private_key) {
      return {
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      };
    }
  }
  const envClientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const envPrivateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (envClientEmail && envPrivateKey) {
    return {
      clientEmail: envClientEmail,
      privateKey: envPrivateKey,
    };
  }
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (envPath && fs.existsSync(envPath)) {
    const parsed = JSON.parse(fs.readFileSync(envPath, 'utf8')) as {
      client_email?: string;
      private_key?: string;
    };
    if (parsed.client_email && parsed.private_key) {
      return {
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      };
    }
  }
  throw new InternalServerErrorException(
    `Meet audit SA credentials file missing at ${resolveMeetAuditSaRelativePath()}`,
  );
}
