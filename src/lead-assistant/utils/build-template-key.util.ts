/** Stable identity of a WhatsApp template (`name::language`). */
export function buildTemplateKey(name: string, language: string): string {
  return `${name}::${language}`;
}
