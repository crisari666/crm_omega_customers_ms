export type MarketingCampaignMsEvent = {
  readonly type: 'marketing_campaign';
  readonly payload: {
    readonly action: 'send.marketing_template';
    readonly campaignRecipientId: string;
    readonly to: string;
    readonly templateName: string;
    readonly languageCode: string;
    readonly components?: Record<string, unknown>[];
  };
};

export type MarketingCampaignSendResponse = {
  readonly success: boolean;
  readonly message?: string;
  readonly messageId?: string;
};
