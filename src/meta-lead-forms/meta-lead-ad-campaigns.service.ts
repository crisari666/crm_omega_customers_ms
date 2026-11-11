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
  MetaLeadAdCampaignNestedAd,
  MetaLeadAdCampaignRegisteredStat,
  MetaLeadAdCampaignStatsSlice,
} from './types/meta-lead-ad-campaign-stats.type';

type CampaignAggRow = {
  readonly _id: string;
  readonly campaignName?: string;
  readonly leadCount: number;
  readonly ads: readonly {
    readonly adId: string;
    readonly adName?: string;
    readonly leadCount: number;
  }[];
};

/**
 * Admin CRUD for Meta Campaign → project registry and unregistered-campaign stats.
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
    const campaignId = dto.campaignId.trim();
    const existing = await this.adCampaignModel
      .findOne({ campaignId })
      .lean()
      .exec();
    if (existing != null) {
      throw new ConflictException(`Campaign id ${campaignId} is already registered`);
    }
    const created = await this.adCampaignModel.create({
      campaignId,
      campaignName: dto.campaignName.trim(),
      projectId: dto.projectId.trim(),
      projectTitle: (dto.projectTitle ?? '').trim(),
      adId: this.trimOptional(dto.adId),
      adName: this.trimOptional(dto.adName),
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
    if (dto.campaignId != null) {
      const campaignId = dto.campaignId.trim();
      const clash = await this.adCampaignModel
        .findOne({ campaignId, _id: { $ne: id } })
        .lean()
        .exec();
      if (clash != null) {
        throw new ConflictException(
          `Campaign id ${campaignId} is already registered`,
        );
      }
      setFields.campaignId = campaignId;
    }
    if (dto.campaignName != null) {
      setFields.campaignName = dto.campaignName.trim();
    }
    if (dto.projectId != null) {
      setFields.projectId = dto.projectId.trim();
    }
    if (dto.projectTitle !== undefined) {
      setFields.projectTitle = (dto.projectTitle ?? '').trim();
    }
    if (dto.adId !== undefined) {
      setFields.adId = this.trimOptional(dto.adId) ?? '';
    }
    if (dto.adName !== undefined) {
      setFields.adName = this.trimOptional(dto.adName) ?? '';
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
   * Aggregates leadgen rows by Meta campaign id and joins against the campaign registry.
   */
  async executeGetAdStats(): Promise<MetaLeadAdCampaignStatsSlice> {
    const [registryRows, groups] = await Promise.all([
      this.adCampaignModel.find().sort({ campaignName: 1 }).lean().exec(),
      this.metaLeadCampaignModel
        .aggregate<CampaignAggRow>([
          {
            $addFields: {
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
              resolvedAdId: {
                $trim: { input: { $ifNull: ['$graphAdId', ''] } },
              },
              resolvedAdName: {
                $trim: { input: { $ifNull: ['$graphAdName', ''] } },
              },
            },
          },
          { $match: { resolvedCampaignId: { $ne: '' } } },
          {
            $group: {
              _id: {
                campaignId: '$resolvedCampaignId',
                adId: '$resolvedAdId',
              },
              campaignName: { $first: '$resolvedCampaignName' },
              adName: { $first: '$resolvedAdName' },
              leadCount: { $sum: 1 },
            },
          },
          {
            $group: {
              _id: '$_id.campaignId',
              campaignName: { $first: '$campaignName' },
              leadCount: { $sum: '$leadCount' },
              ads: {
                $push: {
                  adId: '$_id.adId',
                  adName: '$adName',
                  leadCount: '$leadCount',
                },
              },
            },
          },
          { $sort: { leadCount: -1 } },
        ])
        .exec(),
    ]);
    const groupsByCampaignId = new Map<string, MetaLeadAdCampaignGroup>();
    for (const group of groups) {
      const campaignId = (group._id ?? '').trim();
      if (campaignId.length === 0) {
        continue;
      }
      const ads: MetaLeadAdCampaignNestedAd[] = (group.ads ?? [])
        .map((ad) => ({
          adId: (ad.adId ?? '').trim(),
          adName: (ad.adName ?? '').trim(),
          leadCount: ad.leadCount,
        }))
        .filter((ad) => ad.adId.length > 0)
        .sort((a, b) => b.leadCount - a.leadCount);
      groupsByCampaignId.set(campaignId, {
        campaignId,
        campaignName: (group.campaignName ?? '').trim(),
        leadCount: group.leadCount,
        ads,
      });
    }
    const registeredIds = new Set<string>();
    for (const row of registryRows) {
      const campaignId = (row.campaignId ?? '').trim();
      if (campaignId.length > 0) {
        registeredIds.add(campaignId);
      }
    }
    const registeredCampaigns: MetaLeadAdCampaignRegisteredStat[] =
      registryRows.map((row) => {
        const campaignId = (row.campaignId ?? '').trim();
        const match =
          campaignId.length > 0
            ? groupsByCampaignId.get(campaignId)
            : undefined;
        return {
          id: String(row._id),
          campaignId,
          campaignName: (row.campaignName ?? '').trim(),
          projectId: row.projectId,
          projectTitle: row.projectTitle ?? '',
          leadCount: match?.leadCount ?? 0,
          ads: match?.ads ?? [],
        };
      });
    const unregisteredCampaigns = [...groupsByCampaignId.values()].filter(
      (group) => !registeredIds.has(group.campaignId),
    );
    return { registeredCampaigns, unregisteredCampaigns };
  }

  private trimOptional(value: string | undefined): string | undefined {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private mapListItem(row: {
    readonly _id: { toString(): string };
    readonly campaignId?: string;
    readonly campaignName?: string;
    readonly projectId: string;
    readonly projectTitle?: string;
    readonly adId?: string;
    readonly adName?: string;
    readonly enabled: boolean;
    readonly notes?: string;
    readonly createdByOfficeUserId?: string;
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
  }): MetaLeadAdCampaignListItem {
    return {
      id: String(row._id),
      campaignId: (row.campaignId ?? '').trim(),
      campaignName: (row.campaignName ?? '').trim(),
      projectId: row.projectId,
      projectTitle: row.projectTitle ?? '',
      adId: row.adId,
      adName: row.adName,
      enabled: row.enabled,
      notes: row.notes ?? '',
      createdByOfficeUserId: row.createdByOfficeUserId,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  }
}
