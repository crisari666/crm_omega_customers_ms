import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WhatsappMarketingCampaignRecipient,
  WhatsappMarketingRecipientDocument,
  WhatsappMarketingRecipientStatus,
} from './schemas/whatsapp-marketing-campaign-recipient.schema';
import { WhatsappMarketingDispatchService } from './whatsapp-marketing-dispatch.service';
import { parseMetaWebhookTimestampToDate } from '../customer/utils/parse-meta-webhook-timestamp.util';
import { shouldApplyWebhookStatus } from './utils/whatsapp-marketing-stats.util';

export type MarketingMessageStatusPayload = {
  readonly whatsappMessageId: string;
  readonly status: string;
  readonly timestamp?: string | number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
};

@Injectable()
export class WhatsappMarketingStatusService {
  private readonly logger = new Logger(WhatsappMarketingStatusService.name);

  constructor(
    @InjectModel(WhatsappMarketingCampaignRecipient.name)
    private readonly recipientModel: Model<WhatsappMarketingRecipientDocument>,
    private readonly dispatchService: WhatsappMarketingDispatchService,
  ) {}

  async executeApplyMessageStatus(payload: MarketingMessageStatusPayload): Promise<void> {
    const messageId = payload.whatsappMessageId.trim();
    if (messageId.length === 0) {
      return;
    }
    const normalized = this.normalizeStatus(payload.status);
    if (normalized == null) {
      return;
    }
    const recipient = await this.recipientModel.findOne({ whatsappMessageId: messageId }).exec();
    if (recipient == null) {
      return;
    }
    if (!shouldApplyWebhookStatus(recipient.status, normalized)) {
      return;
    }
    const now = parseMetaWebhookTimestampToDate(payload.timestamp);
    recipient.status = normalized;
    recipient.lastStatusAt = now;
    recipient.lastStatusSource = 'webhook';
    if (normalized === 'failed') {
      recipient.errorCode = payload.errorCode;
      recipient.errorMessage = payload.errorMessage;
    }
    recipient.statusHistory.push({
      status: normalized,
      at: now,
      source: 'webhook',
      detail: payload.errorMessage,
    });
    this.logger.log(
      `marketing status: recipientId=${String(recipient._id)} messageId=${messageId} status=${normalized} at=${now.toISOString()}`,
    );
    await recipient.save();
    await this.dispatchService.executeRecalculateCampaignStats(
      recipient.campaignId as Types.ObjectId,
    );
  }

  private normalizeStatus(raw: string): WhatsappMarketingRecipientStatus | null {
    const value = raw.trim().toLowerCase();
    if (value === 'sent' || value === 'delivered' || value === 'read' || value === 'failed') {
      return value;
    }
    return null;
  }
}
