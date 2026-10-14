/** Lowercase, strip accents/emoji/punctuation and collapse whitespace (for fuzzy matching). */
export function normalizeLeadText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/²/g, '2')
    .replace(/(\d)[.,](?=\d{3}\b)/g, '$1')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
