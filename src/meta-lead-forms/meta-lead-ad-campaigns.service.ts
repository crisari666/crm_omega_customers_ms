import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MetaLeadCampaign,
  MetaLeadCampaignDocument,
} from '../customer/schemas/meta-lead-campaign.schema';
import { CreateMetaLeadAdCampaignDto } from './dto/create-meta-lead-ad-campaign.dto';
import { UpdateMetaLeadAdCampaignDto } from './dto/update-meta-lead-ad-campaign.dto';
import {
  MetaLeadAdCampaign,
  MetaLeadAdCampaignDocument,
} from './schemas/meta-lead-ad-campaign.schema';
import type { MetaLeadAdCampaignListItem } from './types/meta-lead-ad-campaign-list-item.type';
import type {
  MetaLeadAdCampaignGroup,
  MetaLeadAdCampaignRegisteredStat,
  MetaLeadAdCampaignStatsSlice,
} from './types/meta-lead-ad-campaign-stats.type';

type CampaignAdAggRow = {
  readonly _id: string;
  readonly adName?: string;
  readonly campaignId?: string;
  readonly campaignName?: string;
  readonly leadCount: number;
};

/**
 * Admin CRUD for Meta Ad → project registry and unregistered-ad stats.
 */
@Injectable()
export class MetaLeadAdCampaignsService {
  constructor(
    @InjectModel(MetaLeadAdCampaign.name)
    private readonly adCampaignModel: Model<MetaLeadAdCampaignDocument>,
    @InjectModel(MetaLeadCampaign.name)
    private readonly metaLeadCampaignModel: Model<MetaLeadCampaignDocument>,
  ) {}

  async executeList(): Promise<MetaLeadAdCampaignListItem[]> {
    const rows = await this.adCampaignModel
      .find()
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean()
      .exec();
    return rows.map((row) => this.mapListItem(row));
  }

  async executeGetById(id: string): Promise<MetaLeadAdCampaignListItem> {
    const row = await this.adCampaignModel.findById(id).lean().exec();
    if (row == null) {
      throw new NotFoundException(`Meta lead ad campaign ${id} was not found`);
    }
    return this.mapListItem(row);
  }

  async executeCreate(
    dto: CreateMetaLeadAdCampaignDto,
    createdByOfficeUserId?: string,
  ): Promise<MetaLeadAdCampaignListItem> {
    const adId = dto.adId.trim();
    const existing = await this.adCampaignModel.findOne({ adId }).lean().exec();
    if (existing != null) {
      throw new ConflictException(`Ad id ${adId} is already registered`);
    }
    const created = await this.adCampaignModel.create({
      adId,
      adName: dto.adName.trim(),
      campaignId: this.trimOptional(dto.campaignId),
      campaignName: this.trimOptional(dto.campaignName),
      projectId: dto.projectId.trim(),
      projectTitle: (dto.projectTitle ?? '').trim(),
      enabled: dto.enabled ?? true,
      notes: (dto.notes ?? '').trim(),
      ...(createdByOfficeUserId != null && createdByOfficeUserId.length > 0
        ? { createdByOfficeUserId }
        : {}),
    });
    return this.mapListItem(created.toObject());
  }

  async executeUpdate(
    id: string,
    dto: UpdateMetaLeadAdCampaignDto,
  ): Promise<MetaLeadAdCampaignListItem> {
    const setFields: Record<string, unknown> = {};
    if (dto.adId != null) {
      const adId = dto.adId.trim();
      const clash = await this.adCampaignModel
        .findOne({ adId, _id: { $ne: id } })
        .lean()
        .exec();
      if (clash != null) {
        throw new ConflictException(`Ad id ${adId} is already registered`);
      }
      setFields.adId = adId;
    }
    if (dto.adName != null) {
      setFields.adName = dto.adName.trim();
    }
    if (dto.campaignId !== undefined) {
      setFields.campaignId = this.trimOptional(dto.campaignId) ?? '';
    }
    if (dto.campaignName !== undefined) {
      setFields.campaignName = this.trimOptional(dto.campaignName) ?? '';
    }
    if (dto.projectId != null) {
      setFields.projectId = dto.projectId.trim();
    }
    if (dto.projectTitle !== undefined) {
      setFields.projectTitle = (dto.projectTitle ?? '').trim();
    }
    if (dto.enabled != null) {
      setFields.enabled = dto.enabled;
    }
    if (dto.notes != null) {
      setFields.notes = dto.notes.trim();
    }
    const updated = await this.adCampaignModel
      .findByIdAndUpdate(id, { $set: setFields }, { new: true })
      .lean()
      .exec();
    if (updated == null) {
      throw new NotFoundException(`Meta lead ad campaign ${id} was not found`);
    }
    return this.mapListItem(updated);
  }

  async executeDelete(id: string): Promise<{ readonly deleted: true }> {
    const result = await this.adCampaignModel.findByIdAndDelete(id).exec();
    if (result == null) {
      throw new NotFoundException(`Meta lead ad campaign ${id} was not found`);
    }
    return { deleted: true };
  }

  /**
   * Aggregates leadgen campaigns by Meta ad id and joins against the ad registry.
   */
  async executeGetAdStats(): Promise<MetaLeadAdCampaignStatsSlice> {
    const [ads, groups] = await Promise.all([
      this.adCampaignModel.find().sort({ adName: 1 }).lean().exec(),
      this.metaLeadCampaignModel
        .aggregate<CampaignAdAggRow>([
          {
            $addFields: {
              resolvedAdId: {
                $trim: { input: { $ifNull: ['$graphAdId', ''] } },
              },
              resolvedAdName: {
                $trim: { input: { $ifNull: ['$graphAdName', ''] } },
              },
              resolvedCampaignId: {
                $trim: { input: { $ifNull: ['$graphCampaignId', ''] } },
              },
              resolvedCampaignName: {
                $trim: {
                  input: {
                    $ifNull: [
                      '$graphCampaignName',
                      { $ifNull: ['$mappedFields.campaign_name', ''] },
                    ],
                  },
                },
              },
            },
          },
          { $match: { resolvedAdId: { $ne: '' } } },
          {
            $group: {
              _id: '$resolvedAdId',
              adName: { $first: '$resolvedAdName' },
              campaignId: { $first: '$resolvedCampaignId' },
              campaignName: { $first: '$resolvedCampaignName' },
              leadCount: { $sum: 1 },
            },
          },
          { $sort: { leadCount: -1 } },
        ])
        .exec(),
    ]);
    const countByAdId = new Map<string, MetaLeadAdCampaignGroup>();
    for (const group of groups) {
      const adId = (group._id ?? '').trim();
      if (adId.length === 0) {
        continue;
      }
      countByAdId.set(adId, {
        adId,
        adName: (group.adName ?? '').trim(),
        campaignId: (group.campaignId ?? '').trim() || undefined,
        campaignName: (group.campaignName ?? '').trim() || undefined,
        leadCount: group.leadCount,
      });
    }
    const registeredIds = new Set(ads.map((ad) => ad.adId.trim()));
    const registered: MetaLeadAdCampaignRegisteredStat[] = ads.map((ad) => {
      const match = countByAdId.get(ad.adId.trim());
      return {
        id: String(ad._id),
        adId: ad.adId,
        adName: ad.adName,
        projectId: ad.projectId,
        projectTitle: ad.projectTitle ?? '',
        leadCount: match?.leadCount ?? 0,
      };
    });
    const unregisteredAds = [...countByAdId.values()].filter(
      (group) => !registeredIds.has(group.adId),
    );
    return { registeredAds: registered, unregisteredAds };
  }

  private trimOptional(value: string | undefined): string | undefined {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private mapListItem(row: {
    readonly _id: { toString(): string };
    readonly adId: string;
    readonly adName: string;
    readonly campaignId?: string;
    readonly campaignName?: string;
    readonly projectId: string;
    readonly projectTitle?: string;
    readonly enabled: boolean;
    readonly notes?: string;
    readonly createdByOfficeUserId?: string;
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
  }): MetaLeadAdCampaignListItem {
    return {
      id: String(row._id),
      adId: row.adId,
      adName: row.adName,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      projectId: row.projectId,
      projectTitle: row.projectTitle ?? '',
      enabled: row.enabled,
      notes: row.notes ?? '',
      createdByOfficeUserId: row.createdByOfficeUserId,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  }
}
