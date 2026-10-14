/** Replaces `{{key}}` placeholders; unknown keys are replaced with an empty string. */
export function interpolateTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? '');
}
