/** Strips markdown fences and outer whitespace from LLM completion text. */
export function normalizeCallAuditLlmJsonContent(raw: string): string {
  let text = raw.trim();
  if (text.startsWith('```')) {
    const firstNewline = text.indexOf('\n');
    if (firstNewline !== -1) {
      text = text.slice(firstNewline + 1);
    }
    const fenceEnd = text.lastIndexOf('```');
    if (fenceEnd !== -1) {
      text = text.slice(0, fenceEnd);
    }
    text = text.trim();
  }
  return text;
}
