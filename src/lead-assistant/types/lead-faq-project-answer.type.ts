/** Answer of a FAQ that only applies to one project. */
export type LeadFaqProjectAnswer = {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly answer: string;
};
