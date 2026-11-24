import { normalizeLeadText } from '../../utils/normalize-lead-text.util';
import type { LeadProfile } from '../../types/lead-profile.type';

type LeadMotivation = NonNullable<LeadProfile['motivation']>;

const MOTIVATION_RULES: readonly { readonly motivation: LeadMotivation; readonly stems: readonly string[] }[] = [
  {
    motivation: 'build',
    stems: [
      'construir',
      'construi',
      'construccion',
      'build',
      'casa',
      'hogar',
      'familia',
      'hijos',
      'retiro',
      'vivir',
      'propia',
      'propio',
    ],
  },
  {
    motivation: 'invest',
    stems: [
      'inversion',
      'invertir',
      'invert',
      'invest',
      'negocio',
      'renta',
      'plusvalia',
      'valorizacion',
      'rentar',
      'alquiler',
      'patrimonio',
    ],
  },
  {
    motivation: 'leisure',
    stems: ['ocio', 'vacacion', 'vacaciones', 'descanso', 'leisure', 'finde', 'fines', 'escapar'],
  },
  {
    motivation: 'exploring',
    stems: ['explorando', 'explorar', 'mirando', 'solo mirando', 'curioseando', 'exploring', 'informacion', 'cotizar'],
  },
];

/**
 * Maps free-text WhatsApp replies to a V2 motivation when the LLM is unavailable.
 * Tolerates short typos (e.g. "construi4" → build) via normalized stem prefixes.
 */
export function parseLeadMotivationReply(text: string): LeadMotivation | undefined {
  const normalized = normalizeLeadText(text);
  if (normalized === '') return undefined;
  const tokens = normalized.split(' ');
  for (const rule of MOTIVATION_RULES) {
    if (rule.stems.some((stem) => matchesStem(normalized, tokens, stem))) {
      return rule.motivation;
    }
  }
  return undefined;
}

/** Joins pending inbound bodies and returns the first motivation match. */
export function parseLeadMotivationFromPending(pendingTexts: readonly string[]): LeadMotivation | undefined {
  for (const text of pendingTexts) {
    const motivation = parseLeadMotivationReply(text);
    if (motivation !== undefined) return motivation;
  }
  const joined = pendingTexts.join(' ');
  return parseLeadMotivationReply(joined);
}

function matchesStem(normalized: string, tokens: readonly string[], stem: string): boolean {
  if (normalized === stem || normalized.includes(` ${stem} `) || normalized.startsWith(`${stem} `) || normalized.endsWith(` ${stem}`)) {
    return true;
  }
  if (normalized.startsWith(stem) && normalized.length <= stem.length + 2) {
    return true;
  }
  return tokens.some((token) => token === stem || (token.startsWith(stem) && token.length <= stem.length + 2));
}
