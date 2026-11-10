export type MetaLeadFormCampaignGroup = {
  readonly formId: string;
  readonly formName: string;
  readonly leadCount: number;
};

export type MetaLeadFormRegisteredStat = {
  readonly id: string;
  readonly formId: string;
  readonly formName: string;
  readonly leadCount: number;
};

export type MetaLeadFormStatsResponse = {
  readonly registered: readonly MetaLeadFormRegisteredStat[];
  readonly unregisteredForms: readonly MetaLeadFormCampaignGroup[];
};
