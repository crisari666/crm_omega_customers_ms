import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetaLeadForm, MetaLeadFormDocument } from '../meta-lead-forms/schemas/meta-lead-form.schema';
import { LeadAssistantSettingsService } from './lead-assistant-settings.service';
import { LeadRecoverySequenceService } from './lead-recovery-sequence.service';
import { LeadTemplatesService } from './lead-templates.service';
import { LeadFaq, LeadFaqDocument } from './schemas/lead-faq.schema';
import type { LeadFaqCategory } from './types/lead-faq-category.type';
import type { LeadReadinessResponse } from './types/lead-readiness-response.type';
import { buildTemplateKey } from './utils/build-template-key.util';
import { evaluateLeadReadiness } from './utils/evaluate-lead-readiness.util';

/**
 * Gathers the facts needed by the assistant readiness checklist and evaluates the rules.
 */
@Injectable()
export class LeadReadinessService {
  constructor(
    @InjectModel(LeadFaq.name) private readonly faqModel: Model<LeadFaqDocument>,
    @InjectModel(MetaLeadForm.name) private readonly metaLeadFormModel: Model<MetaLeadFormDocument>,
    private readonly leadAssistantSettingsService: LeadAssistantSettingsService,
    private readonly leadRecoverySequenceService: LeadRecoverySequenceService,
    private readonly leadTemplatesService: LeadTemplatesService,
    private readonly configService: ConfigService,
  ) {}

  async executeGetReadiness(): Promise<LeadReadinessResponse> {
    const [templates, settings, sequence, enabledFaqCategories, enabledFaqCount, enabledV2FormCount] =
      await Promise.all([
        this.leadTemplatesService.executeList(false),
        this.leadAssistantSettingsService.executeGetOrCreate(),
        this.leadRecoverySequenceService.executeGet(),
        this.faqModel.distinct('category', { enabled: true }).exec() as Promise<LeadFaqCategory[]>,
        this.faqModel.countDocuments({ enabled: true }).exec(),
        this.metaLeadFormModel.countDocuments({ enabled: true, flowStrategy: 'lead_conversation_v2' }).exec(),
      ]);
    return evaluateLeadReadiness({
      configuredPhoneNumberId: this.configService.get<string>('leadConversation.phoneNumberId', '') ?? '',
      templatesError: templates.error,
      rpcPhoneNumberId: templates.phoneNumberId,
      approvedTemplateKeys: new Set(
        templates.templates.map((template) => buildTemplateKey(template.name, template.language)),
      ),
      settings,
      enabledFaqCount,
      enabledFaqCategories: new Set(enabledFaqCategories),
      steps: sequence.steps,
      hasEnabledV2Form: enabledV2FormCount > 0,
    });
  }
}
