import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MetaLeadAdCampaign,
  MetaLeadAdCampaignDocument,
} from './schemas/meta-lead-ad-campaign.schema';
import type { MetaLeadAdCampaignMatch } from './types/meta-lead-ad-campaign-match.type';

/**
 * Resolves an enabled Meta Ad → RAG project registry row by ad id.
 */
@Injectable()
export class MetaLeadAdCampaignLookupService {
  constructor(
    @InjectModel(MetaLeadAdCampaign.name)
    private readonly adCampaignModel: Model<MetaLeadAdCampaignDocument>,
  ) {}

  async executeFindEnabledByAdId(
    adId: string,
  ): Promise<MetaLeadAdCampaignMatch | null> {
    const trimmed = adId.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const row = await this.adCampaignModel
      .findOne({ adId: trimmed, enabled: true })
      .lean()
      .exec();
    if (row == null) {
      return null;
    }
    return {
      id: String(row._id),
      adId: row.adId,
      adName: row.adName,
      projectId: row.projectId,
      projectTitle: row.projectTitle ?? '',
    };
  }
}
