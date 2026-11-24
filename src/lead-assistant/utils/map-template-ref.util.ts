import type { LeadTemplateRef } from '../../lead-conversation/types/lead-template-ref.type';

/** Copies a stored/DTO template reference into a plain `LeadTemplateRef` (no Mongoose internals). */
export function mapTemplateRef(source: LeadTemplateRef): LeadTemplateRef {
  return {
    name: source.name,
    language: source.language,
    bodyText: source.bodyText,
    bindings: source.bindings.map((binding) => ({
      variable: binding.variable,
      component: binding.component,
      format: binding.format,
      source: binding.source,
      ...(binding.staticValue != null ? { staticValue: binding.staticValue } : {}),
    })),
  };
}
