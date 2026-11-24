import { normalizeLeadText } from '../../lead-conversation/utils/normalize-lead-text.util';

const MIN_TOKEN_LENGTH = 3;
const CONTAINMENT_SCORE_BASE = 1_000;

type FaqMatchSource = {
  readonly question: string;
  readonly alternativePhrasings?: readonly string[];
};

function scorePhraseAgainstCustomer(customerText: string, phrase: string): number {
  const normalizedPhrase = normalizeLeadText(phrase);
  if (normalizedPhrase.length === 0) {
    return 0;
  }
  if (customerText.includes(normalizedPhrase) || normalizedPhrase.includes(customerText)) {
    return CONTAINMENT_SCORE_BASE + normalizedPhrase.length;
  }
  const customerTokens = new Set(
    customerText.split(' ').filter((token) => token.length >= MIN_TOKEN_LENGTH),
  );
  const phraseTokens = normalizedPhrase
    .split(' ')
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
  if (phraseTokens.length === 0 || customerTokens.size === 0) {
    return 0;
  }
  const hits = phraseTokens.filter((token) => customerTokens.has(token)).length;
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
