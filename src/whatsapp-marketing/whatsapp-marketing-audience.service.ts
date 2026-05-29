import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import type { MarketingAudienceFilter } from './types/marketing-audience-filter.type';
import type { WhatsappMarketingAudiencePreviewResponse } from './types/whatsapp-marketing-api.type';
import { buildMarketingAudienceFilter } from './utils/build-marketing-audience-filter.util';

type AudiencePreviewInput = {
  readonly audienceMode: 'filter' | 'manual' | 'combined';
  readonly audienceFilter?: MarketingAudienceFilter;
  readonly manualCustomerIds?: string[];
};

@Injectable()
export class WhatsappMarketingAudienceService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
  ) {}

  async executePreviewAudience(
    input: AudiencePreviewInput,
  ): Promise<WhatsappMarketingAudiencePreviewResponse> {
    const ids = await this.resolveAudienceCustomerIds(input);
    const { withPhone, excludedNoPhone } = await this.partitionByPhone(ids);
    return {
      total: withPhone.length,
      excludedNoPhone,
      mode: input.audienceMode,
    };
  }

  async resolveAudienceCustomerIdsWithPhone(input: AudiencePreviewInput): Promise<string[]> {
    const ids = await this.resolveAudienceCustomerIds(input);
    const { withPhone } = await this.partitionByPhone(ids);
    return withPhone;
  }

  async resolveAudienceCustomerIds(input: AudiencePreviewInput): Promise<string[]> {
    const mode = input.audienceMode;
    const manualIds = (input.manualCustomerIds ?? []).map((id) => id.trim()).filter((id) => id.length > 0);
    if (mode === 'manual') {
      return [...new Set(manualIds)];
    }
    const filterIds =
      mode === 'filter' || mode === 'combined'
        ? await this.findCustomerIdsByFilter(input.audienceFilter)
        : [];
    if (mode === 'filter') {
      return filterIds;
    }
    return [...new Set([...filterIds, ...manualIds])];
  }

  private async findCustomerIdsByFilter(
    filterInput: MarketingAudienceFilter | undefined,
  ): Promise<string[]> {
    const match = buildMarketingAudienceFilter(filterInput);
    const docs = await this.customerModel.find(match).select('_id').lean().exec();
    return docs.map((doc) => String(doc._id));
  }

  private async partitionByPhone(
    customerIds: string[],
  ): Promise<{ readonly withPhone: string[]; readonly excludedNoPhone: number }> {
    if (customerIds.length === 0) {
      return { withPhone: [], excludedNoPhone: 0 };
    }
    const objectIds = customerIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const docs = await this.customerModel
      .find({ _id: { $in: objectIds } })
      .select('_id phone')
      .lean()
      .exec();
    const withPhone: string[] = [];
    let excludedNoPhone = 0;
    for (const doc of docs) {
      const phone = typeof doc.phone === 'string' ? doc.phone.trim() : '';
      if (phone.length === 0) {
        excludedNoPhone += 1;
        continue;
      }
      withPhone.push(String(doc._id));
    }
    excludedNoPhone += Math.max(0, objectIds.length - docs.length);
    return { withPhone, excludedNoPhone };
  }
}
