export type MetaLeadAdCampaignNestedAd = {
  readonly adId: string;
  readonly adName: string;
  readonly leadCount: number;
};

export type MetaLeadAdCampaignGroup = {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly leadCount: number;
  readonly ads: readonly MetaLeadAdCampaignNestedAd[];
};

export type MetaLeadAdCampaignRegisteredStat = {
  readonly id: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly leadCount: number;
  readonly ads: readonly MetaLeadAdCampaignNestedAd[];
};

export type MetaLeadAdCampaignStatsSlice = {
  readonly registeredCampaigns: readonly MetaLeadAdCampaignRegisteredStat[];
  readonly unregisteredCampaigns: readonly MetaLeadAdCampaignGroup[];
};
