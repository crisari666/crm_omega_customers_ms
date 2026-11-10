export type MetaLeadAdCampaignGroup = {
  readonly adId: string;
  readonly adName: string;
  readonly campaignId?: string;
  readonly campaignName?: string;
  readonly leadCount: number;
};

export type MetaLeadAdCampaignRegisteredStat = {
  readonly id: string;
  readonly adId: string;
  readonly adName: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly leadCount: number;
};

export type MetaLeadAdCampaignStatsSlice = {
  readonly registeredAds: readonly MetaLeadAdCampaignRegisteredStat[];
  readonly unregisteredAds: readonly MetaLeadAdCampaignGroup[];
};
