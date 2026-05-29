export type MarketingAudienceFilter = {
  readonly omitDateRange?: boolean;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly assignedTo?: string;
  readonly unassignedOnly?: boolean;
  readonly enabled?: boolean;
  readonly isReferral?: boolean;
  readonly search?: string;
  readonly customerStepIds?: string[];
};
