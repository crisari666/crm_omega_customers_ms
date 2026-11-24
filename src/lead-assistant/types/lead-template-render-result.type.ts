/** Graph `template.components` plus the human readable body that will be shown to the customer. */
export type LeadTemplateRenderResult = {
  readonly templateComponents: Record<string, unknown>[];
  readonly renderedBody: string;
};
