import { REPLY_KEYWORDS } from '../constants/reply-keywords.constants';
import type { OutboundOption } from '../types/outbound-message-plan.type';
import { normalizeLeadText } from './normalize-lead-text.util';

const MIN_PARTIAL_MATCH_LENGTH = 3;

const hasWord = (haystack: string, needle: string): boolean =>
  ` ${haystack} `.includes(` ${needle} `);

const SHORT_TITLE_MAX_LENGTH = 2;

const extractNumbers = (value: string): string[] => value.split(' ').filter((token) => /^\d+$/.test(token));

function isTitleMatch(text: string, option: OutboundOption): boolean {
  const title = normalizeLeadText(option.title);
  if (title === '' || text === '') return false;
  if (title.length <= SHORT_TITLE_MAX_LENGTH) return hasWord(text, title);
  if (text === title || text.includes(title)) return true;
  if (text.length >= MIN_PARTIAL_MATCH_LENGTH && title.includes(text)) return true;
  const titleNumbers = extractNumbers(title).filter((token) => token.length >= MIN_PARTIAL_MATCH_LENGTH);
  return titleNumbers.some((token) => hasWord(text, token));
}

function isKeywordMatch(text: string, option: OutboundOption): boolean {
  const keywords = REPLY_KEYWORDS[option.id] ?? [];
  return keywords.some((keyword) => (keyword.length <= 2 ? hasWord(text, keyword) : text.includes(keyword)));
}

/**
 * Resolves the offered option a free-text reply refers to.
 * Exact/contains title match wins over keyword aliases; returns undefined when ambiguous.
 */
export function matchOptionByText(rawText: string, options: readonly OutboundOption[]): OutboundOption | undefined {
  const text = normalizeLeadText(rawText);
  const titleMatches = options.filter((option) => isTitleMatch(text, option));
  if (titleMatches.length === 1) return titleMatches[0];
  const keywordMatches = options.filter((option) => isKeywordMatch(text, option));
  return keywordMatches.length === 1 ? keywordMatches[0] : undefined;
}
