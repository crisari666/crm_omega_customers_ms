/** Rendered V2 welcome template ready to be sent through the leads WhatsApp line. */
export type LeadAgentWelcomeOutbound = {
  readonly templateName: string;
  readonly languageCode: string;
  readonly templateComponents: Record<string, unknown>[];
  readonly renderedBody: string;
  /** From the Meta ad→project registry when the campaign is mapped. */
  readonly projectId?: string;
  readonly projectTitle?: string;
};
