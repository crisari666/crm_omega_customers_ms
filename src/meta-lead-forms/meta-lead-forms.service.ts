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
import {
  DEFAULT_OUTBOUND_DELAY_MINUTES,
  META_LEAD_FORM_SETTINGS_KEY,
} from './constants/meta-lead-form.constants';
import { CreateMetaLeadFormDto } from './dto/create-meta-lead-form.dto';
import { UpdateMetaLeadFormDto } from './dto/update-meta-lead-form.dto';
import { UpdateMetaLeadFormSettingsDto } from './dto/update-meta-lead-form-settings.dto';
import {
  MetaLeadForm,
  MetaLeadFormDocument,
} from './schemas/meta-lead-form.schema';
import {
  MetaLeadFormSettings,
  MetaLeadFormSettingsDocument,
} from './schemas/meta-lead-form-settings.schema';
import type {
  MetaLeadFormListItem,
  MetaLeadFormSettingsView,
} from './types/meta-lead-form-list-item.type';
import { MetaLeadAdCampaignsService } from './meta-lead-ad-campaigns.service';
import type {
  MetaLeadFormCampaignGroup,
  MetaLeadFormStatsResponse,
} from './types/meta-lead-form-stats.type';

type CampaignFormAggRow = {
  readonly _id: string;
  readonly formName?: string;
  readonly leadCount: number;
};

/**
 * Admin CRUD for Meta Lead Ads form registry and outbound delay settings.
 */
@Injectable()
export class MetaLeadFormsService {
  constructor(
    @InjectModel(MetaLeadForm.name)
    private readonly metaLeadFormModel: Model<MetaLeadFormDocument>,
    @InjectModel(MetaLeadFormSettings.name)
    private readonly settingsModel: Model<MetaLeadFormSettingsDocument>,
    @InjectModel(MetaLeadCampaign.name)
    private readonly metaLeadCampaignModel: Model<MetaLeadCampaignDocument>,
    private readonly metaLeadAdCampaignsService: MetaLeadAdCampaignsService,
  ) {}

  async executeList(): Promise<MetaLeadFormListItem[]> {
    const rows = await this.metaLeadFormModel
      .find()
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean()
      .exec();
    return rows.map((row) => this.mapListItem(row));
  }

  async executeGetById(id: string): Promise<MetaLeadFormListItem> {
    const row = await this.metaLeadFormModel.findById(id).lean().exec();
    if (row == null) {
      throw new NotFoundException(`Meta lead form ${id} was not found`);
    }
    return this.mapListItem(row);
  }

  async executeCreate(
    dto: CreateMetaLeadFormDto,
    createdByOfficeUserId?: string,
  ): Promise<MetaLeadFormListItem> {
    const formId = dto.formId.trim();
    const formName = dto.formName.trim();
    const existing = await this.metaLeadFormModel.findOne({ formId }).lean().exec();
    if (existing != null) {
      throw new ConflictException(`Form id ${formId} is already registered`);
    }
    const created = await this.metaLeadFormModel.create({
      formId,
      formName,
      flowStrategy: dto.flowStrategy,
      enabled: dto.enabled ?? true,
      notes: (dto.notes ?? '').trim(),
      ...(createdByOfficeUserId != null && createdByOfficeUserId.length > 0
        ? { createdByOfficeUserId }
        : {}),
    });
    return this.mapListItem(created.toObject());
  }

  async executeUpdate(id: string, dto: UpdateMetaLeadFormDto): Promise<MetaLeadFormListItem> {
    const setFields: Record<string, unknown> = {};
    if (dto.formId != null) {
      const formId = dto.formId.trim();
      const clash = await this.metaLeadFormModel
        .findOne({ formId, _id: { $ne: id } })
        .lean()
        .exec();
      if (clash != null) {
        throw new ConflictException(`Form id ${formId} is already registered`);
      }
      setFields.formId = formId;
    }
    if (dto.formName != null) {
      setFields.formName = dto.formName.trim();
    }
    if (dto.flowStrategy != null) {
      setFields.flowStrategy = dto.flowStrategy;
    }
    if (dto.enabled != null) {
      setFields.enabled = dto.enabled;
    }
    if (dto.notes != null) {
      setFields.notes = dto.notes.trim();
    }
    const updated = await this.metaLeadFormModel
      .findByIdAndUpdate(id, { $set: setFields }, { new: true })
      .lean()
      .exec();
    if (updated == null) {
      throw new NotFoundException(`Meta lead form ${id} was not found`);
    }
    return this.mapListItem(updated);
  }

  async executeDelete(id: string): Promise<{ readonly deleted: true }> {
    const result = await this.metaLeadFormModel.findByIdAndDelete(id).exec();
    if (result == null) {
      throw new NotFoundException(`Meta lead form ${id} was not found`);
    }
    return { deleted: true };
  }

  async executeGetSettings(): Promise<MetaLeadFormSettingsView> {
    const settings = await this.executeEnsureSettings();
    return { outboundDelayMinutes: settings.outboundDelayMinutes };
  }

  async executeUpdateSettings(
    dto: UpdateMetaLeadFormSettingsDto,
  ): Promise<MetaLeadFormSettingsView> {
    const updated = await this.settingsModel
      .findOneAndUpdate(
        { key: META_LEAD_FORM_SETTINGS_KEY },
        {
          $set: { outboundDelayMinutes: dto.outboundDelayMinutes },
          $setOnInsert: { key: META_LEAD_FORM_SETTINGS_KEY },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return {
      outboundDelayMinutes:
        updated?.outboundDelayMinutes ?? DEFAULT_OUTBOUND_DELAY_MINUTES,
    };
  }

  async executeGetOutboundDelayMs(): Promise<number> {
    const settings = await this.executeEnsureSettings();
    return settings.outboundDelayMinutes * 60_000;
  }

  /**
   * Aggregates leadgen campaigns by Meta form id and joins against the registry.
   */
  async executeGetStats(): Promise<MetaLeadFormStatsResponse> {
    const [forms, groups, adStats] = await Promise.all([
      this.metaLeadFormModel.find().sort({ formName: 1 }).lean().exec(),
      this.metaLeadCampaignModel
        .aggregate<CampaignFormAggRow>([
          {
            $addFields: {
              resolvedFormId: {
                $trim: {
                  input: {
                    $ifNull: ['$formId', { $ifNull: ['$graphFormId', ''] }],
                  },
                },
              },
              resolvedFormName: {
                $trim: {
                  input: { $ifNull: ['$graphFormName', ''] },
                },
              },
            },
          },
          {
            $match: {
              resolvedFormId: { $ne: '' },
            },
          },
          {
            $group: {
              _id: '$resolvedFormId',
              formName: { $first: '$resolvedFormName' },
              leadCount: { $sum: 1 },
            },
          },
          { $sort: { leadCount: -1 } },
        ])
        .exec(),
      this.metaLeadAdCampaignsService.executeGetAdStats(),
    ]);
    const countByFormId = new Map<string, MetaLeadFormCampaignGroup>();
    for (const group of groups) {
      const formId = (group._id ?? '').trim();
      if (formId.length === 0) {
        continue;
      }
      countByFormId.set(formId, {
        formId,
        formName: (group.formName ?? '').trim(),
        leadCount: group.leadCount,
      });
    }
    const registeredIds = new Set(forms.map((form) => form.formId.trim()));
    const registered = forms.map((form) => {
      const match = countByFormId.get(form.formId.trim());
      return {
        id: String(form._id),
        formId: form.formId,
        formName: form.formName,
        leadCount: match?.leadCount ?? 0,
      };
    });
    const unregisteredForms = [...countByFormId.values()].filter(
      (group) => !registeredIds.has(group.formId),
    );
    return {
      registered,
      unregisteredForms,
      registeredAds: adStats.registeredAds,
      unregisteredAds: adStats.unregisteredAds,
    };
  }

  private async executeEnsureSettings(): Promise<{
    readonly outboundDelayMinutes: number;
  }> {
    const existing = await this.settingsModel
      .findOne({ key: META_LEAD_FORM_SETTINGS_KEY })
      .lean()
      .exec();
    if (existing != null) {
      return { outboundDelayMinutes: existing.outboundDelayMinutes };
    }
    const created = await this.settingsModel.create({
      key: META_LEAD_FORM_SETTINGS_KEY,
      outboundDelayMinutes: DEFAULT_OUTBOUND_DELAY_MINUTES,
    });
    return { outboundDelayMinutes: created.outboundDelayMinutes };
  }

  private mapListItem(row: {
    readonly _id: { toString(): string };
    readonly formId: string;
    readonly formName: string;
    readonly flowStrategy: MetaLeadFormListItem['flowStrategy'];
    readonly enabled: boolean;
    readonly notes?: string;
    readonly createdByOfficeUserId?: string;
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
  }): MetaLeadFormListItem {
    return {
      id: String(row._id),
      formId: row.formId,
      formName: row.formName,
      flowStrategy: row.flowStrategy,
      enabled: row.enabled,
      notes: row.notes ?? '',
      createdByOfficeUserId: row.createdByOfficeUserId,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  }
}
