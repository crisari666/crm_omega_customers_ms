/** Values available to template bindings. */
export type LeadTemplateRenderContext = {
  readonly firstName?: string;
  readonly assistantName: string;
  readonly businessName: string;
  readonly projectTitle?: string;
};
