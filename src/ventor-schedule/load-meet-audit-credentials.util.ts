import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { MEET_AUDIT_SA_RELATIVE_PATH } from './google-meet-audit.constants';

export type MeetAuditServiceAccountCredentials = {
  readonly clientEmail: string;
  readonly privateKey: string;
};

/**
 * Loads Meet-audit SA credentials only from the repo JSON file (no env fallbacks).
 */
export function loadMeetAuditServiceAccountCredentials(): MeetAuditServiceAccountCredentials {
  const keyPath = path.join(process.cwd(), MEET_AUDIT_SA_RELATIVE_PATH);
  if (!fs.existsSync(keyPath)) {
    throw new InternalServerErrorException(
      `Meet audit SA credentials file missing at ${MEET_AUDIT_SA_RELATIVE_PATH}`,
    );
  }
  const parsed = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as {
    client_email?: string;
    private_key?: string;
  };
  if (!parsed.client_email || !parsed.private_key) {
    throw new InternalServerErrorException(
      'Invalid Meet audit SA credentials file (client_email / private_key).',
    );
  }
  return {
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  };
}
