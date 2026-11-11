export type MetaLeadAdCampaignListItem = {
  readonly id: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly adId?: string;
  readonly adName?: string;
  readonly enabled: boolean;
  readonly notes: string;
  readonly createdByOfficeUserId?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
};
