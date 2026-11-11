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
 * Resolves a RAG project for a lead from Meta campaign registry or seeded interestedProjects.
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
    const fromCampaign = await this.resolveFromLatestCampaign(customerId);
    if (fromCampaign != null) {
      return fromCampaign;
    }
    return this.resolveFromInterestedProjects(customerId);
  }

  private async resolveFromLatestCampaign(
    customerId: Types.ObjectId,
  ): Promise<LeadProject | undefined> {
    const campaign = await this.metaLeadCampaignModel
      .findOne({
        customerId,
        $or: [
          { graphCampaignId: { $exists: true, $nin: [null, ''] } },
          { resolvedProjectId: { $exists: true, $nin: [null, ''] } },
        ],
      })
      .sort({ createdAt: -1 })
      .select({ graphCampaignId: 1, resolvedProjectId: 1 })
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
    const campaignId = (campaign.graphCampaignId ?? '').trim();
    if (campaignId.length === 0) {
      return undefined;
    }
    const match =
      await this.adCampaignLookup.executeFindEnabledByCampaignId(campaignId);
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
