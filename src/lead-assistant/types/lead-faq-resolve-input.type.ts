/** Inputs for resolving FAQs into the agent prompt. */
export type LeadFaqResolveInput = {
  readonly projectId?: string;
  /** Pending customer text; when set, FAQs that match it rank above mere usage. */
  readonly customerText?: string;
};
