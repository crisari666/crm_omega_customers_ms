/** Lead vs promoted customer (same Customer document). */
export const CUSTOMER_LIFECYCLE_STATUSES = ['lead', 'customer'] as const;

export type CustomerLifecycleStatus = (typeof CUSTOMER_LIFECYCLE_STATUSES)[number];
