const MAX_FIRST_NAME_LENGTH = 30;

/** First word of the WhatsApp profile name, capitalized; empty when the profile has no letters. */
export function extractFirstName(profileName: string): string {
  const firstWord = profileName.trim().split(/\s+/u)[0] ?? '';
  if (!/\p{L}/u.test(firstWord)) return '';
  const cleaned = firstWord.slice(0, MAX_FIRST_NAME_LENGTH);
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}
