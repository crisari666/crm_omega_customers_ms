import { normalizeLeadText } from '../../lead-conversation/utils/normalize-lead-text.util';
import {
  LEAD_FAQ_FALLBACK_MIN_SCORE,
  LEAD_FAQ_REVERSE_CONTAINMENT_MIN_LENGTH_RATIO,
  LEAD_FAQ_REVERSE_CONTAINMENT_MIN_TOKENS,
  LEAD_FAQ_STEM_MIN_CHARS,
} from '../constants/lead-assistant.constants';
import type { LeadResolvedFaq } from '../types/lead-resolved-faq.type';

const MIN_TOKEN_LENGTH = 3;
const CONTAINMENT_SCORE_BASE = 1_000;

type FaqMatchSource = {
  readonly question: string;
  readonly alternativePhrasings?: readonly string[];
};

export type LeadFaqBestMatch = {
  readonly faq: LeadResolvedFaq;
  readonly score: number;
};

function tokensShareStem(left: string, right: string): boolean {
  if (left === right) return true;
  const minLength = Math.min(left.length, right.length);
  if (minLength < LEAD_FAQ_STEM_MIN_CHARS) return false;
  const prefixLength = Math.min(minLength, Math.max(LEAD_FAQ_STEM_MIN_CHARS, Math.floor(minLength * 0.8)));
  return left.slice(0, prefixLength) === right.slice(0, prefixLength);
}

function countTokenHits(customerTokens: ReadonlySet<string>, phraseTokens: readonly string[]): number {
  let hits = 0;
  for (const phraseToken of phraseTokens) {
    if (customerTokens.has(phraseToken)) {
      hits += 1;
      continue;
    }
    for (const customerToken of customerTokens) {
      if (tokensShareStem(customerToken, phraseToken)) {
        hits += 1;
        break;
      }
    }
  }
  return hits;
}

function significantTokens(text: string): string[] {
  return text.split(' ').filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/**
 * True when the customer text is long/dense enough to treat as a paraphrase
 * of the FAQ phrase (`phrase.includes(customer)`), not a short keyword reply.
 */
function allowsReverseContainment(customerText: string, phrase: string): boolean {
  const tokens = significantTokens(customerText);
  if (tokens.length < LEAD_FAQ_REVERSE_CONTAINMENT_MIN_TOKENS) {
    return false;
  }
  if (phrase.length === 0) {
    return false;
  }
  return customerText.length / phrase.length >= LEAD_FAQ_REVERSE_CONTAINMENT_MIN_LENGTH_RATIO;
}

function scorePhraseAgainstCustomer(customerText: string, phrase: string): number {
  const normalizedPhrase = normalizeLeadText(phrase);
  if (normalizedPhrase.length === 0) {
    return 0;
  }
  if (customerText.includes(normalizedPhrase)) {
    return CONTAINMENT_SCORE_BASE + normalizedPhrase.length;
  }
  if (
    normalizedPhrase.includes(customerText) &&
    allowsReverseContainment(customerText, normalizedPhrase)
  ) {
    return CONTAINMENT_SCORE_BASE + normalizedPhrase.length;
  }
  const customerTokens = new Set(significantTokens(customerText));
  const phraseTokens = significantTokens(normalizedPhrase);
  if (phraseTokens.length === 0 || customerTokens.size === 0) {
    return 0;
  }
  // One-word replies (e.g. "Construir") must not beat the FAQ fallback threshold via
  // a single shared stem on a long question — require multi-token customer text.
  if (customerTokens.size < LEAD_FAQ_REVERSE_CONTAINMENT_MIN_TOKENS) {
    return 0;
  }
  const hits = countTokenHits(customerTokens, phraseTokens);
  return Math.round((hits / phraseTokens.length) * (CONTAINMENT_SCORE_BASE - 1));
}

/**
 * How well a customer message matches a FAQ question or its alternate phrasings.
 * Higher is better. Zero when there is nothing to compare.
 */
export function scoreLeadFaqMatch(customerText: string, faq: FaqMatchSource): number {
  const normalizedCustomer = normalizeLeadText(customerText);
  if (normalizedCustomer.length === 0) {
    return 0;
  }
  const phrases = [faq.question, ...(faq.alternativePhrasings ?? [])];
  return phrases.reduce(
    (best, phrase) => Math.max(best, scorePhraseAgainstCustomer(normalizedCustomer, phrase)),
    0,
  );
}

/**
 * Best FAQ whose match score meets {@link LEAD_FAQ_FALLBACK_MIN_SCORE}, or undefined.
 */
export function pickBestLeadFaqMatch(
  customerText: string,
  faqs: readonly LeadResolvedFaq[],
  minScore: number = LEAD_FAQ_FALLBACK_MIN_SCORE,
): LeadFaqBestMatch | undefined {
  let best: LeadFaqBestMatch | undefined;
  for (const faq of faqs) {
    const score = scoreLeadFaqMatch(customerText, faq);
    if (score < minScore) continue;
    if (best === undefined || score > best.score) {
      best = { faq, score };
    }
  }
  return best;
}
