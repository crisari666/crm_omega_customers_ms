const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Returns the distinct `{{variable}}` names of a template text, in order of appearance. */
export function extractTemplateVariables(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    names.add(match[1]);
  }
  return [...names];
}
