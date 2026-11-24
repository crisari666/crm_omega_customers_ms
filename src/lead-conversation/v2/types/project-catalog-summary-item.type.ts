/** One line of the project catalog shown to the agent when the lead has no project yet. */
export type ProjectCatalogSummaryItem = {
  readonly id: string;
  readonly title: string;
  readonly location: string;
  readonly priceFrom?: number;
};
