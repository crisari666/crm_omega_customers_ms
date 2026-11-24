/**
 * Extracts a JSON object string from a raw model reply:
 * trims, strips markdown fences, then slices from the first `{` to the last `}`.
 */
export function salvageLeadAgentLlmJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return withoutFences.slice(start, end + 1);
}
