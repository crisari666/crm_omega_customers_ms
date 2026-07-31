import { createHash } from 'crypto';

/**
 * Normalizes and SHA-256 hashes a contact value for Meta Conversions API.
 * Returns empty string when input is blank after normalize.
 */
export function hashMetaCapiValue(raw: string, kind: 'email' | 'phone' | 'name'): string {
  const normalized = normalizeMetaCapiValue(raw, kind);
  if (normalized.length === 0) {
    return '';
  }
  return createHash('sha256').update(normalized).digest('hex');
}

function normalizeMetaCapiValue(raw: string, kind: 'email' | 'phone' | 'name'): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (kind === 'email') {
    return trimmed.toLowerCase();
  }
  if (kind === 'phone') {
    return trimmed.replace(/\D/g, '');
  }
  return trimmed.toLowerCase();
}

/**
 * Builds Meta `fbc` from a raw fbclid when present.
 */
export function buildMetaFbcFromFbclid(fbclid: string, creationTimeMs: number = Date.now()): string {
  const trimmed = fbclid.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed.startsWith('fb.')) {
    return trimmed;
  }
  return `fb.1.${creationTimeMs}.${trimmed}`;
}
