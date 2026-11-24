import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type UpdateQuery } from 'mongoose';
import { LEAD_ASSISTANT_SETTINGS_KEY } from './constants/lead-assistant.constants';
import type { UpdateLeadAssistantSettingsDto } from './dto/update-lead-assistant-settings.dto';
import {
  LeadAssistantSettings,
  LeadAssistantSettingsDocument,
} from './schemas/lead-assistant-settings.schema';
import type { LeadAssistantSettingsView } from './types/lead-assistant-settings-view.type';
import { mapTemplateRef } from './utils/map-template-ref.util';

type SettingsRow = LeadAssistantSettings & { readonly updatedAt?: Date };

const SCALAR_FIELDS = [
  'assistantName',
  'businessName',
  'greeting',
  'pricePolicy',
  'defaultInboundFlow',
  'enabled',
  'replyDebounceSeconds',
] as const;

/**
 * Singleton settings of the lead assistant (identity, greeting, price policy, welcome template).
 */
@Injectable()
export class LeadAssistantSettingsService {
  constructor(
    @InjectModel(LeadAssistantSettings.name)
    private readonly settingsModel: Model<LeadAssistantSettingsDocument>,
    private readonly configService: ConfigService,
  ) {}

  /** Returns the settings, creating them (seeding `businessName` from the brand config) when missing. */
  async executeGetOrCreate(): Promise<LeadAssistantSettingsView> {
    const row = await this.settingsModel
      .findOneAndUpdate(
        { key: LEAD_ASSISTANT_SETTINGS_KEY },
        { $setOnInsert: { businessName: this.resolveDefaultBusinessName() } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return this.mapView(row);
  }

  /** Applies a partial update; `welcomeTemplate: null` clears the welcome template. */
  async executeUpdate(dto: UpdateLeadAssistantSettingsDto): Promise<LeadAssistantSettingsView> {
    const update = this.buildUpdate(dto);
    if (update == null) {
      return this.executeGetOrCreate();
    }
    const row = await this.settingsModel
      .findOneAndUpdate({ key: LEAD_ASSISTANT_SETTINGS_KEY }, update, { upsert: true, new: true })
      .lean()
      .exec();
    return this.mapView(row);
  }

  /** True when a welcome template is stored; never creates the settings document. */
  async executeHasWelcomeTemplate(): Promise<boolean> {
    const row = await this.settingsModel
      .findOne({ key: LEAD_ASSISTANT_SETTINGS_KEY })
      .select({ welcomeTemplate: 1 })
      .lean()
      .exec();
    return row?.welcomeTemplate != null;
  }

  private buildUpdate(dto: UpdateLeadAssistantSettingsDto): UpdateQuery<LeadAssistantSettingsDocument> | null {
    const setFields: Record<string, unknown> = {};
    for (const field of SCALAR_FIELDS) {
      if (dto[field] != null) {
        setFields[field] = typeof dto[field] === 'string' ? (dto[field] as string).trim() : dto[field];
      }
    }
    if (dto.welcomeTemplate != null) {
      setFields.welcomeTemplate = mapTemplateRef(dto.welcomeTemplate);
    }
    const shouldClearTemplate = dto.welcomeTemplate === null;
    if (Object.keys(setFields).length === 0 && !shouldClearTemplate) {
      return null;
    }
    return {
      ...(Object.keys(setFields).length > 0 ? { $set: setFields } : {}),
      ...(shouldClearTemplate ? { $unset: { welcomeTemplate: '' } } : {}),
      ...(setFields.businessName == null
        ? { $setOnInsert: { businessName: this.resolveDefaultBusinessName() } }
        : {}),
    };
  }

  private resolveDefaultBusinessName(): string {
    return this.configService.get<string>('leadConversation.brand', '') ?? '';
  }

  private mapView(row: SettingsRow): LeadAssistantSettingsView {
    return {
      assistantName: row.assistantName,
      businessName: row.businessName,
      greeting: row.greeting,
      pricePolicy: row.pricePolicy,
      defaultInboundFlow: row.defaultInboundFlow,
      enabled: row.enabled,
      replyDebounceSeconds: row.replyDebounceSeconds,
      ...(row.welcomeTemplate != null ? { welcomeTemplate: mapTemplateRef(row.welcomeTemplate) } : {}),
      updatedAt: row.updatedAt?.toISOString(),
    };
  }
}
