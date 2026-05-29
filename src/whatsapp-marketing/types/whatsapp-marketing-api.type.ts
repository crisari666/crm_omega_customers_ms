import type {
  WhatsappMarketingAudienceMode,
  WhatsappMarketingCampaignStatus,
  WhatsappMarketingCampaignType,
} from '../schemas/whatsapp-marketing-campaign.schema';
import type {
  WhatsappMarketingRecipientStatus,
  WhatsappMarketingReplyOutcome,
  WhatsappMarketingReplyType,
  WhatsappMarketingStatusSource,
} from '../schemas/whatsapp-marketing-campaign-recipient.schema';
import type { MarketingAudienceFilter } from './marketing-audience-filter.type';

export type WhatsappMarketingCampaignStatsResponse = {
  readonly total: number;
  readonly pending: number;
  readonly sent: number;
  readonly delivered: number;
  readonly read: number;
  readonly failed: number;
  readonly cancelled: number;
};

export type WhatsappMarketingCampaignListItem = {
  readonly id: string;
  readonly name: string;
  readonly templateName: string;
  readonly campaignType: WhatsappMarketingCampaignType;
  readonly status: WhatsappMarketingCampaignStatus;
  readonly stats: WhatsappMarketingCampaignStatsResponse;
  readonly createdAt: string;
};

export type WhatsappMarketingCampaignDetail = WhatsappMarketingCampaignListItem & {
  readonly templateLanguage: string;
  readonly templateComponents?: Record<string, unknown>[];
  readonly audienceMode: WhatsappMarketingAudienceMode;
  readonly audienceFilter?: MarketingAudienceFilter;
  readonly manualCustomerIds: string[];
  readonly preserveAssigneeCustomerStepIds: string[];
  readonly replyAdvanceToCustomerStepId?: string;
  readonly batchSize: number;
  readonly batchDelayMs: number;
  readonly updatedAt: string;
};

export type WhatsappMarketingAudiencePreviewResponse = {
  readonly total: number;
  readonly excludedNoPhone: number;
  readonly mode: WhatsappMarketingAudienceMode;
};

export type WhatsappMarketingStatusHistoryItem = {
  readonly status: string;
  readonly at: string;
  readonly source: WhatsappMarketingStatusSource;
  readonly detail?: string;
};

export type WhatsappMarketingRecipientListItem = {
  readonly id: string;
  readonly customerId: string;
  readonly phone: string;
  readonly customerName: string;
  readonly customerStepName?: string;
  readonly status: WhatsappMarketingRecipientStatus;
  readonly whatsappMessageId?: string;
  readonly attemptCount: number;
  readonly lastStatusAt?: string;
  readonly lastStatusSource?: WhatsappMarketingStatusSource;
  readonly errorMessage?: string;
  readonly statusHistory: WhatsappMarketingStatusHistoryItem[];
  readonly repliedAt?: string;
  readonly replyType?: WhatsappMarketingReplyType;
  readonly replyOutcome?: WhatsappMarketingReplyOutcome;
};

export type WhatsappMarketingRecipientListResponse = {
  readonly items: WhatsappMarketingRecipientListItem[];
  readonly total: number;
  readonly limit: number;
  readonly skip: number;
};

export type WhatsappMarketingCampaignListResponse = {
  readonly items: WhatsappMarketingCampaignListItem[];
  readonly total: number;
  readonly limit: number;
  readonly skip: number;
};
