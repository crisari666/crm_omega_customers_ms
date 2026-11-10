import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MetaLeadCampaign,
  MetaLeadCampaignDocument,
} from '../customer/schemas/meta-lead-campaign.schema';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { MetaLeadAdCampaignLookupService } from '../meta-lead-forms/meta-lead-ad-campaign-lookup.service';
import { ProjectCatalogService } from './project-catalog.service';
import type { LeadProject } from './types/lead-project.type';

/**
 * Resolves a RAG project for a lead from Meta ad registry or seeded interestedProjects.
 */
@Injectable()
export class LeadAdProjectResolverService {
  constructor(
    @InjectModel(MetaLeadCampaign.name)
    private readonly metaLeadCampaignModel: Model<MetaLeadCampaignDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly adCampaignLookup: MetaLeadAdCampaignLookupService,
    private readonly catalog: ProjectCatalogService,
  ) {}

  async executeResolveForCustomer(
    customerId: Types.ObjectId,
  ): Promise<LeadProject | undefined> {
    const fromAd = await this.resolveFromLatestCampaignAd(customerId);
    if (fromAd != null) {
      return fromAd;
    }
    return this.resolveFromInterestedProjects(customerId);
  }

  private async resolveFromLatestCampaignAd(
    customerId: Types.ObjectId,
  ): Promise<LeadProject | undefined> {
    const campaign = await this.metaLeadCampaignModel
      .findOne({ customerId, graphAdId: { $exists: true, $nin: [null, ''] } })
      .sort({ createdAt: -1 })
      .select({ graphAdId: 1, resolvedProjectId: 1 })
      .lean()
      .exec();
    if (campaign == null) {
      return undefined;
    }
    const resolvedId = (campaign.resolvedProjectId ?? '').trim();
    if (resolvedId.length > 0) {
      const byResolved = await this.catalog.findProjectById(resolvedId);
      if (byResolved != null) {
        return byResolved;
      }
    }
    const adId = (campaign.graphAdId ?? '').trim();
    if (adId.length === 0) {
      return undefined;
    }
    const match = await this.adCampaignLookup.executeFindEnabledByAdId(adId);
    if (match == null || match.projectId.trim().length === 0) {
      return undefined;
    }
    return this.catalog.findProjectById(match.projectId.trim());
  }

  private async resolveFromInterestedProjects(
    customerId: Types.ObjectId,
  ): Promise<LeadProject | undefined> {
    const customer = await this.customerModel
      .findById(customerId)
      .select({ interestedProjects: 1 })
      .lean()
      .exec();
    const projects = customer?.interestedProjects ?? [];
    if (projects.length === 0) {
      return undefined;
    }
    const last = projects[projects.length - 1];
    const projectId = (last?.projectId ?? '').trim();
    if (projectId.length === 0) {
      return undefined;
    }
    return this.catalog.findProjectById(projectId);
  }
}
