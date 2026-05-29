import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { CustomerConversationsService } from '../customer-conversations/customer-conversations.service';
import { ConfigService } from '@nestjs/config';
import {
  WhatsappMarketingCampaign,
  WhatsappMarketingCampaignDocument,
} from './schemas/whatsapp-marketing-campaign.schema';
import {
  WhatsappMarketingCampaignRecipient,
  WhatsappMarketingRecipientDocument,
} from './schemas/whatsapp-marketing-campaign-recipient.schema';
import { WhatsappMarketingOutboundService } from './whatsapp-marketing-outbound.service';
import { createEmptyCampaignStats } from './utils/whatsapp-marketing-stats.util';
import { buildMarketingTemplateComponents } from './utils/build-marketing-template-components.util';
import type { MarketingCampaignMsEvent } from './types/marketing-campaign-ms-event.type';

@Injectable()
export class WhatsappMarketingDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappMarketingDispatchService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectModel(WhatsappMarketingCampaign.name)
    private readonly campaignModel: Model<WhatsappMarketingCampaignDocument>,
    @InjectModel(WhatsappMarketingCampaignRecipient.name)
    private readonly recipientModel: Model<WhatsappMarketingRecipientDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly outboundService: WhatsappMarketingOutboundService,
    private readonly conversationsService: CustomerConversationsService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.executeTickAllSendingCampaigns();
    }, 3000);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle != null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async executeTickAllSendingCampaigns(): Promise<void> {
    const campaigns = await this.campaignModel
      .find({ status: 'sending' })
      .select(
        '_id batchSize batchDelayMs templateName templateLanguage templateComponents templateHeaderMediaId templateHeaderMediaType',
      )
      .lean()
      .exec();
    for (const campaign of campaigns) {
      await this.executeProcessCampaignBatch(String(campaign._id));
    }
  }

  async executeProcessCampaignBatch(campaignId: string): Promise<void> {
    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (campaign == null || campaign.status !== 'sending') {
      return;
    }
    const pending = await this.recipientModel
      .find({ campaignId: campaign._id, status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(campaign.batchSize)
      .exec();
    if (pending.length === 0) {
      await this.executeFinalizeCampaignIfDone(campaign);
      return;
    }
    for (const recipient of pending) {
      await this.executeSendOneRecipient(campaign, recipient);
    }
    if (campaign.batchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, campaign.batchDelayMs));
    }
    await this.executeFinalizeCampaignIfDone(campaign);
  }

  async executeSendOneRecipient(
    campaign: WhatsappMarketingCampaignDocument,
    recipient: WhatsappMarketingRecipientDocument,
    isRetry = false,
  ): Promise<void> {
    recipient.status = 'sending';
    await recipient.save();
    const components = buildMarketingTemplateComponents({
      templateHeaderMediaId: campaign.templateHeaderMediaId,
      templateHeaderMediaType: campaign.templateHeaderMediaType,
      templateComponents: campaign.templateComponents,
    });
    const event: MarketingCampaignMsEvent = {
      type: 'marketing_campaign',
      payload: {
        action: 'send.marketing_template',
        campaignRecipientId: String(recipient._id),
        to: recipient.phone,
        templateName: campaign.templateName,
        languageCode: campaign.templateLanguage,
        ...(components != null && components.length > 0 ? { components } : {}),
      },
    };
    const response = await this.outboundService.executeSendMarketingTemplate(event);
    const now = new Date();
    if (!response.success || response.messageId == null || response.messageId.trim() === '') {
      recipient.status = 'failed';
      recipient.lastStatusAt = now;
      recipient.lastStatusSource = 'api';
      recipient.errorMessage = response.message ?? 'send failed';
      recipient.statusHistory.push({
        status: 'failed',
        at: now,
        source: 'api',
        detail: recipient.errorMessage,
      });
      await recipient.save();
      await this.executeRecalculateCampaignStats(campaign._id as Types.ObjectId);
      return;
    }
    recipient.status = 'sent';
    recipient.whatsappMessageId = response.messageId.trim();
    recipient.attemptCount = isRetry ? recipient.attemptCount + 1 : Math.max(1, recipient.attemptCount + 1);
    recipient.lastStatusAt = now;
    recipient.lastStatusSource = 'api';
    recipient.errorCode = undefined;
    recipient.errorMessage = undefined;
    recipient.statusHistory.push({
      status: 'sent',
      at: now,
      source: 'api',
      detail: response.messageId,
    });
    await recipient.save();
    await this.executePersistOutboundConversation(campaign, recipient, response.messageId);
    await this.executeRecalculateCampaignStats(campaign._id as Types.ObjectId);
  }

  private async executePersistOutboundConversation(
    campaign: WhatsappMarketingCampaignDocument,
    recipient: WhatsappMarketingRecipientDocument,
    messageId: string,
  ): Promise<void> {
    const phoneNumberId = this.configService.get<string>('whatsappMarketing.phoneNumberId', '') ?? '';
    if (phoneNumberId.trim() === '') {
      this.logger.warn('whatsappMarketing.phoneNumberId missing; skip conversation upsert');
      return;
    }
    const waId = recipient.phone.trim();
    const sessionId = `cloud:${phoneNumberId}:${waId}`;
    await this.conversationsService.executeUpsertFromMetaIngress({
      sessionId,
      chatId: waId,
      customerId: recipient.customerId,
      contactName: recipient.customerName,
      crmMessage: true,
      message: {
        messageId,
        fromMe: true,
        body: campaign.templateName,
        type: 'template',
        timestamp: Math.floor(Date.now() / 1000),
        hasMedia: false,
        mediaType: null,
        mediaPath: null,
        mediaMimeType: null,
        mediaFilename: null,
      },
    });
  }

  async executeRecalculateCampaignStats(campaignId: Types.ObjectId): Promise<void> {
    const agg = await this.recipientModel.aggregate<{ _id: string; count: number }>([
      { $match: { campaignId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const stats = createEmptyCampaignStats();
    let total = 0;
    for (const row of agg) {
      const count = row.count;
      total += count;
      const key = row._id;
      if (key === 'pending' || key === 'sending') {
        stats.pending += count;
      } else if (key === 'sent' || key === 'replied') {
        stats.sent += count;
      } else if (key === 'delivered') {
        stats.delivered += count;
      } else if (key === 'read') {
        stats.read += count;
      } else if (key === 'failed') {
        stats.failed += count;
      } else if (key === 'cancelled') {
        stats.cancelled += count;
      }
    }
    stats.total = total;
    await this.campaignModel.updateOne({ _id: campaignId }, { $set: { stats } }).exec();
  }

  private async executeFinalizeCampaignIfDone(
    campaign: WhatsappMarketingCampaignDocument,
  ): Promise<void> {
    const pendingCount = await this.recipientModel.countDocuments({
      campaignId: campaign._id,
      status: { $in: ['pending', 'sending'] },
    });
    if (pendingCount === 0 && campaign.status === 'sending') {
      campaign.status = 'completed';
      await campaign.save();
    }
  }

  async executeBuildRecipientsForCampaign(
    campaign: WhatsappMarketingCampaignDocument,
    customerIds: string[],
  ): Promise<void> {
    const objectIds = customerIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const customers = await this.customerModel
      .find({ _id: { $in: objectIds }, phone: { $exists: true, $nin: [null, ''] } })
      .select('_id phone name lastName customerStepId')
      .lean()
      .exec();
    const ops = customers.map((doc) => {
      const nameParts = [doc.name, doc.lastName].filter((p) => typeof p === 'string' && p.trim() !== '');
      const customerName = nameParts.join(' ').trim();
      return {
        insertOne: {
          document: {
            campaignId: campaign._id,
            customerId: doc._id,
            phone: String(doc.phone).trim(),
            customerName: customerName.length > 0 ? customerName : String(doc.phone),
            customerStepIdAtSend: doc.customerStepId,
            status: 'pending',
            attemptCount: 0,
            statusHistory: [],
          },
        },
      };
    });
    if (ops.length > 0) {
      await this.recipientModel.bulkWrite(ops, { ordered: false });
    }
    await this.executeRecalculateCampaignStats(campaign._id as Types.ObjectId);
  }
}
