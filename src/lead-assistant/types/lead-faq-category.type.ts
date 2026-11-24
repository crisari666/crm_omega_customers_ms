export const LEAD_FAQ_CATEGORIES = [
  'price',
  'financing',
  'legal',
  'location',
  'services',
  'process',
  'other',
] as const;

/** Topic of a frequently asked question. */
export type LeadFaqCategory = (typeof LEAD_FAQ_CATEGORIES)[number];
