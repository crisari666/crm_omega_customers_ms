import type { WhatsappMarketingCampaignStats } from '../schemas/whatsapp-marketing-campaign.schema';
import type { WhatsappMarketingRecipientStatus } from '../schemas/whatsapp-marketing-campaign-recipient.schema';

export function createEmptyCampaignStats(): WhatsappMarketingCampaignStats {
  return {
    total: 0,
    pending: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    cancelled: 0,
  };
}

const STATUS_COUNT_KEYS: Record<
  WhatsappMarketingRecipientStatus,
  keyof WhatsappMarketingCampaignStats | null
> = {
  pending: 'pending',
  sending: 'pending',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  cancelled: 'cancelled',
  replied: 'sent',
};

export function mapRecipientStatusToStatsKey(
  status: WhatsappMarketingRecipientStatus,
): keyof WhatsappMarketingCampaignStats | null {
  return STATUS_COUNT_KEYS[status];
}

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
  cancelled: 6,
  replied: 7,
};

export function shouldApplyWebhookStatus(
  current: WhatsappMarketingRecipientStatus,
  incoming: WhatsappMarketingRecipientStatus,
): boolean {
  if (current === incoming) {
    return false;
  }
  if (incoming === 'failed') {
    return true;
  }
  const currentRank = STATUS_RANK[current] ?? 0;
  const incomingRank = STATUS_RANK[incoming] ?? 0;
  return incomingRank >= currentRank;
}
