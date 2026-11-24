import type { LeadTemplateBinding } from './lead-template-binding.type';

/** Approved WhatsApp template plus how to fill its variables. */
export type LeadTemplateRef = {
  readonly name: string;
  readonly language: string;
  readonly bodyText: string;
  readonly bindings: readonly LeadTemplateBinding[];
};
