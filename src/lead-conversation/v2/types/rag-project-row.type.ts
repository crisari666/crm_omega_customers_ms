/** Loosely typed omega_rag project document (only the fields read by the agent). */
export type RagProjectRow = {
  readonly _id?: string;
  readonly id?: string;
  readonly title?: string;
  readonly shortDescription?: string;
  readonly description?: string;
  readonly location?: string;
  readonly city?: string;
  readonly state?: string;
  readonly priceSell?: number;
  readonly lotOptions?: readonly { area?: number; price?: number }[];
  readonly amenities?: readonly unknown[];
  readonly amenitiesGroups?: readonly unknown[];
  readonly plane?: string;
  readonly brochure?: string;
  readonly reelVideos?: readonly string[];
  readonly verticalVideos?: readonly string[];
};
