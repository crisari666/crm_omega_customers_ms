import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CustomerStep,
  CustomerStepDocument,
} from '../customer-steps/schemas/customer-step.schema';
import {
  WhatsappMarketingCampaign,
  WhatsappMarketingCampaignDocument,
} from './schemas/whatsapp-marketing-campaign.schema';
import {
  WhatsappMarketingCampaignRecipient,
  WhatsappMarketingRecipientDocument,
} from './schemas/whatsapp-marketing-campaign-recipient.schema';
import { WhatsappMarketingAudienceService } from './whatsapp-marketing-audience.service';
import { WhatsappMarketingDispatchService } from './whatsapp-marketing-dispatch.service';
import { createEmptyCampaignStats } from './utils/whatsapp-marketing-stats.util';
import type { CreateWhatsappMarketingCampaignDto } from './dto/create-whatsapp-marketing-campaign.dto';
import type { UpdateWhatsappMarketingCampaignDto } from './dto/update-whatsapp-marketing-campaign.dto';
import type { AudiencePreviewBodyDto } from './dto/audience-preview.dto';
import type { ListWhatsappMarketingCampaignsQueryDto } from './dto/list-whatsapp-marketing-campaigns.query.dto';
import type { ListWhatsappMarketingRecipientsQueryDto } from './dto/list-whatsapp-marketing-recipients.query.dto';
import type {
  WhatsappMarketingAudiencePreviewResponse,
  WhatsappMarketingCampaignDetail,
  WhatsappMarketingCampaignListResponse,
  WhatsappMarketingRecipientListResponse,
} from './types/whatsapp-marketing-api.type';
import type { MarketingAudienceFilter } from './types/marketing-audience-filter.type';

@Injectable()
export class WhatsappMarketingCampaignService {
  constructor(
    @InjectModel(WhatsappMarketingCampaign.name)
    private readonly campaignModel: Model<WhatsappMarketingCampaignDocument>,
    @InjectModel(WhatsappMarketingCampaignRecipient.name)
    private readonly recipientModel: Model<WhatsappMarketingRecipientDocument>,
    @InjectModel(CustomerStep.name)
    private readonly customerStepModel: Model<CustomerStepDocument>,
    private readonly audienceService: WhatsappMarketingAudienceService,
    private readonly dispatchService: WhatsappMarketingDispatchService,
  ) {}

  async executePreviewAudience(
    body: AudiencePreviewBodyDto,
  ): Promise<WhatsappMarketingAudiencePreviewResponse> {
    return this.audienceService.executePreviewAudience({
      audienceMode: body.audienceMode,
      audienceFilter: body.audienceFilter as MarketingAudienceFilter | undefined,
      manualCustomerIds: body.manualCustomerIds,
    });
  }

  async executeCreateDraft(
    dto: CreateWhatsappMarketingCampaignDto,
    actorUserId: string,
  ): Promise<WhatsappMarketingCampaignDetail> {
    const doc = await this.campaignModel.create({
      name: dto.name.trim(),
      templateName: dto.templateName.trim(),
      templateLanguage: (dto.templateLanguage ?? 'es').trim(),
      templateComponents: dto.templateComponents,
      audienceMode: dto.audienceMode,
      audienceFilter: dto.audienceFilter as Record<string, unknown> | undefined,
      manualCustomerIds: dto.manualCustomerIds ?? [],
      campaignType: dto.campaignType ?? 'standard',
      preserveAssigneeCustomerStepIds: (dto.preserveAssigneeCustomerStepIds ?? []).map(
        (id) => new Types.ObjectId(id),
      ),
      replyAdvanceToCustomerStepId:
        dto.replyAdvanceToCustomerStepId != null
          ? new Types.ObjectId(dto.replyAdvanceToCustomerStepId)
          : undefined,
      batchSize: dto.batchSize,
      batchDelayMs: dto.batchDelayMs ?? 200,
      status: 'draft',
      stats: createEmptyCampaignStats(),
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });
    return this.mapCampaignDetail(doc);
  }

  async executeUpdateDraft(
    campaignId: string,
    dto: UpdateWhatsappMarketingCampaignDto,
    actorUserId: string,
  ): Promise<WhatsappMarketingCampaignDetail> {
    const campaign = await this.findDraftCampaign(campaignId);
    if (dto.name != null) {
      campaign.name = dto.name.trim();
    }
    if (dto.templateName != null) {
      campaign.templateName = dto.templateName.trim();
    }
    if (dto.templateLanguage != null) {
      campaign.templateLanguage = dto.templateLanguage.trim();
    }
    if (dto.templateComponents != null) {
      campaign.templateComponents = dto.templateComponents;
    }
    if (dto.audienceMode != null) {
      campaign.audienceMode = dto.audienceMode;
    }
    if (dto.audienceFilter != null) {
      campaign.audienceFilter = dto.audienceFilter as Record<string, unknown>;
    }
    if (dto.manualCustomerIds != null) {
      campaign.manualCustomerIds = dto.manualCustomerIds;
    }
    if (dto.campaignType != null) {
      campaign.campaignType = dto.campaignType;
    }
    if (dto.preserveAssigneeCustomerStepIds != null) {
      campaign.preserveAssigneeCustomerStepIds = dto.preserveAssigneeCustomerStepIds.map(
        (id) => new Types.ObjectId(id),
      );
    }
    if (dto.replyAdvanceToCustomerStepId != null) {
      campaign.replyAdvanceToCustomerStepId = new Types.ObjectId(dto.replyAdvanceToCustomerStepId);
    }
    if (dto.batchSize != null) {
      campaign.batchSize = dto.batchSize;
    }
    if (dto.batchDelayMs != null) {
      campaign.batchDelayMs = dto.batchDelayMs;
    }
    campaign.updatedBy = actorUserId;
    await campaign.save();
    return this.mapCampaignDetail(campaign);
  }

  async executeListCampaigns(
    query: ListWhatsappMarketingCampaignsQueryDto,
  ): Promise<WhatsappMarketingCampaignListResponse> {
    const limit = query.limit ?? 20;
    const skip = query.skip ?? 0;
    const [items, total] = await Promise.all([
      this.campaignModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.campaignModel.countDocuments().exec(),
    ]);
    return {
      items: items.map((doc) => this.mapCampaignListItem(doc)),
      total,
      limit,
      skip,
    };
  }

  async executeGetCampaign(campaignId: string): Promise<WhatsappMarketingCampaignDetail> {
    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (campaign == null) {
      throw new NotFoundException('Campaign not found');
    }
    return this.mapCampaignDetail(campaign);
  }

  async executeListRecipients(
    campaignId: string,
    query: ListWhatsappMarketingRecipientsQueryDto,
  ): Promise<WhatsappMarketingRecipientListResponse> {
    await this.ensureCampaignExists(campaignId);
    const limit = query.limit ?? 50;
    const skip = query.skip ?? 0;
    const filter: Record<string, unknown> = {
      campaignId: new Types.ObjectId(campaignId),
    };
    if (query.status != null) {
      filter.status = query.status;
    }
    const [recipients, total] = await Promise.all([
      this.recipientModel.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).exec(),
      this.recipientModel.countDocuments(filter).exec(),
    ]);
    const stepIds = new Set<string>();
    for (const row of recipients) {
      if (row.customerStepIdAtSend != null) {
        stepIds.add(String(row.customerStepIdAtSend));
      }
      if (row.customerStepIdAtReply != null) {
        stepIds.add(String(row.customerStepIdAtReply));
      }
    }
    const stepNameById = await this.loadStepNames([...stepIds]);
    return {
      items: recipients.map((row) => this.mapRecipient(row, stepNameById)),
      total,
      limit,
      skip,
    };
  }

  async executeLaunchCampaign(campaignId: string, actorUserId: string): Promise<WhatsappMarketingCampaignDetail> {
    const campaign = await this.findDraftCampaign(campaignId);
    const existingRecipients = await this.recipientModel.countDocuments({
      campaignId: campaign._id,
    });
    if (existingRecipients > 0) {
      throw new ConflictException('Campaign already has recipients; create a new campaign');
    }
    campaign.status = 'building';
    campaign.updatedBy = actorUserId;
    await campaign.save();
    const preview = await this.audienceService.executePreviewAudience({
      audienceMode: campaign.audienceMode,
      audienceFilter: campaign.audienceFilter as MarketingAudienceFilter | undefined,
      manualCustomerIds: campaign.manualCustomerIds,
    });
    if (preview.total === 0) {
      campaign.status = 'failed';
      await campaign.save();
      throw new BadRequestException('No recipients with valid phone for this audience');
    }
    const customerIds = await this.audienceService.resolveAudienceCustomerIdsWithPhone({
      audienceMode: campaign.audienceMode,
      audienceFilter: campaign.audienceFilter as MarketingAudienceFilter | undefined,
      manualCustomerIds: campaign.manualCustomerIds,
    });
    await this.dispatchService.executeBuildRecipientsForCampaign(campaign, customerIds);
    campaign.status = 'sending';
    campaign.updatedBy = actorUserId;
    await campaign.save();
    void this.dispatchService.executeProcessCampaignBatch(String(campaign._id));
    return this.mapCampaignDetail(campaign);
  }

  async executeCancelCampaign(campaignId: string, actorUserId: string): Promise<WhatsappMarketingCampaignDetail> {
    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (campaign == null) {
      throw new NotFoundException('Campaign not found');
    }
    if (campaign.status !== 'sending' && campaign.status !== 'building') {
      throw new BadRequestException('Only sending or building campaigns can be cancelled');
    }
    await this.recipientModel.updateMany(
      { campaignId: campaign._id, status: { $in: ['pending', 'sending'] } },
      { $set: { status: 'cancelled', lastStatusAt: new Date() } },
    );
    campaign.status = 'cancelled';
    campaign.updatedBy = actorUserId;
    await campaign.save();
    await this.dispatchService.executeRecalculateCampaignStats(campaign._id as Types.ObjectId);
    return this.mapCampaignDetail(campaign);
  }

  async executeRetryRecipient(
    campaignId: string,
    recipientId: string,
    actorUserId: string,
  ): Promise<void> {
    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (campaign == null) {
      throw new NotFoundException('Campaign not found');
    }
    const recipient = await this.recipientModel.findOne({
      _id: recipientId,
      campaignId: campaign._id,
    });
    if (recipient == null) {
      throw new NotFoundException('Recipient not found');
    }
    if (recipient.status !== 'failed') {
      throw new ConflictException('Only failed recipients can be retried');
    }
    recipient.status = 'pending';
    recipient.errorCode = undefined;
    recipient.errorMessage = undefined;
    await recipient.save();
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      campaign.status = 'sending';
      campaign.updatedBy = actorUserId;
      await campaign.save();
    }
    await this.dispatchService.executeSendOneRecipient(campaign, recipient, true);
  }

  private async findDraftCampaign(campaignId: string): Promise<WhatsappMarketingCampaignDocument> {
    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (campaign == null) {
      throw new NotFoundException('Campaign not found');
    }
    if (campaign.status !== 'draft') {
      throw new BadRequestException('Only draft campaigns can be edited');
    }
    return campaign;
  }

  private async ensureCampaignExists(campaignId: string): Promise<void> {
    const exists = await this.campaignModel.exists({ _id: campaignId }).exec();
    if (exists == null) {
      throw new NotFoundException('Campaign not found');
    }
  }

  private async loadStepNames(stepIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (stepIds.length === 0) {
      return map;
    }
    const objectIds = stepIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const steps = await this.customerStepModel
      .find({ _id: { $in: objectIds } })
      .select('name')
      .lean()
      .exec();
    for (const step of steps) {
      map.set(String(step._id), step.name);
    }
    return map;
  }

  private mapCampaignListItem(doc: WhatsappMarketingCampaignDocument) {
    return {
      id: String(doc._id),
      name: doc.name,
      templateName: doc.templateName,
      campaignType: doc.campaignType,
      status: doc.status,
      stats: { ...doc.stats },
      createdAt: this.readTimestamp(doc, 'createdAt'),
    };
  }

  private mapCampaignDetail(doc: WhatsappMarketingCampaignDocument): WhatsappMarketingCampaignDetail {
    return {
      ...this.mapCampaignListItem(doc),
      templateLanguage: doc.templateLanguage,
      templateComponents: doc.templateComponents as Record<string, unknown>[] | undefined,
      audienceMode: doc.audienceMode,
      audienceFilter: doc.audienceFilter as MarketingAudienceFilter | undefined,
      manualCustomerIds: doc.manualCustomerIds ?? [],
      preserveAssigneeCustomerStepIds: (doc.preserveAssigneeCustomerStepIds ?? []).map((id) =>
        String(id),
      ),
      replyAdvanceToCustomerStepId:
        doc.replyAdvanceToCustomerStepId != null
          ? String(doc.replyAdvanceToCustomerStepId)
          : undefined,
      batchSize: doc.batchSize,
      batchDelayMs: doc.batchDelayMs,
      updatedAt: this.readTimestamp(doc, 'updatedAt'),
    };
  }

  private readTimestamp(
    doc: WhatsappMarketingCampaignDocument,
    field: 'createdAt' | 'updatedAt',
  ): string {
    const value = (doc as WhatsappMarketingCampaignDocument & { createdAt?: Date; updatedAt?: Date })[
      field
    ];
    return value instanceof Date ? value.toISOString() : new Date().toISOString();
  }

  private mapRecipient(
    row: WhatsappMarketingRecipientDocument,
    stepNameById: Map<string, string>,
  ) {
    const stepId =
      row.customerStepIdAtReply != null
        ? String(row.customerStepIdAtReply)
        : row.customerStepIdAtSend != null
          ? String(row.customerStepIdAtSend)
          : '';
    return {
      id: String(row._id),
      customerId: String(row.customerId),
      phone: row.phone,
      customerName: row.customerName,
      customerStepName: stepId.length > 0 ? stepNameById.get(stepId) : undefined,
      status: row.status,
      whatsappMessageId: row.whatsappMessageId,
      attemptCount: row.attemptCount,
      lastStatusAt: row.lastStatusAt?.toISOString(),
      lastStatusSource: row.lastStatusSource,
      errorMessage: row.errorMessage,
      statusHistory: (row.statusHistory ?? []).map((entry) => ({
        status: entry.status,
        at: entry.at.toISOString(),
        source: entry.source,
        detail: entry.detail,
      })),
      repliedAt: row.repliedAt?.toISOString(),
      replyType: row.replyType,
      replyOutcome: row.replyOutcome,
    };
  }
}
