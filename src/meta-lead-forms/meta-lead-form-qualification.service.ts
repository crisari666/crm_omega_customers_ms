import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { ClientProxy } from '@nestjs/microservices';
import { Model, Types } from 'mongoose';
import { lastValueFrom, timeout } from 'rxjs';
import {
  LEAD_CONVERSATION_SEND_PATTERN,
  LEAD_SEND_RPC_TIMEOUT_MS,
  LEAD_WS_MS_CLIENT,
} from '../lead-conversation/constants/lead-conversation.constants';
import {
  LeadConversationSession,
  LeadConversationSessionDocument,
} from '../lead-conversation/schemas/lead-conversation-session.schema';
import {
  MetaLeadCampaign,
  MetaLeadCampaignDocument,
} from '../customer/schemas/meta-lead-campaign.schema';
import {
  DEFAULT_LEAD_FORM_TEMPLATE_LANGUAGE,
  DEFAULT_LEAD_FORM_TEMPLATE_NAME,
} from './constants/meta-lead-form.constants';
import type { MetaLeadFormQualificationJobData } from './types/meta-lead-form-qualification-job.type';
import { buildLeadFormWelcomeTemplateComponents } from './utils/build-lead-form-welcome-template-components.util';

type LeadSendResult = {
  readonly success: boolean;
  readonly wamid?: string;
  readonly error?: string;
};

/**
 * Sends template-first qualification nudge on the leads WhatsApp line when delay fires.
 */
@Injectable()
export class MetaLeadFormQualificationService {
  private readonly logger = new Logger(MetaLeadFormQualificationService.name);

  constructor(
    @InjectModel(LeadConversationSession.name)
    private readonly sessionModel: Model<LeadConversationSessionDocument>,
    @InjectModel(MetaLeadCampaign.name)
    private readonly metaLeadCampaignModel: Model<MetaLeadCampaignDocument>,
    @Inject(LEAD_WS_MS_CLIENT) private readonly wsMsClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

  async executeDelayedOutbound(job: MetaLeadFormQualificationJobData): Promise<void> {
    const phone = job.phone.replace(/\D/g, '');
    if (phone.length === 0) {
      this.logger.warn(`Delayed outbound skip: empty phone leadgenId=${job.leadgenId}`);
      return;
    }
    const existingSession = await this.sessionModel
      .findOne({ waId: phone, lastInboundAt: { $ne: null } })
      .select('_id lastInboundAt')
      .lean()
      .exec();
    if (existingSession != null) {
      this.logger.log(
        `Delayed outbound skip: inbound already exists waId=${phone} leadgenId=${job.leadgenId}`,
      );
      return;
    }
    const campaign = await this.metaLeadCampaignModel.findOne({ leadgenId: job.leadgenId }).exec();
    if (campaign == null) {
      this.logger.warn(`Delayed outbound skip: campaign missing leadgenId=${job.leadgenId}`);
      return;
    }
    if (campaign.qualificationOutboundSentAt != null) {
      this.logger.log(
        `Delayed outbound skip already-sent leadgenId=${job.leadgenId} wamid=${campaign.qualificationWhatsappMessageId ?? ''}`,
      );
      return;
    }
    const templateName =
      this.configService.get<string>('metaLeadForms.welcomeTemplateName')?.trim() ||
      DEFAULT_LEAD_FORM_TEMPLATE_NAME;
    const languageCode =
      this.configService.get<string>('metaLeadForms.welcomeTemplateLanguage')?.trim() ||
      DEFAULT_LEAD_FORM_TEMPLATE_LANGUAGE;
    const contactName =
      job.contactName.trim().length > 0 ? job.contactName.trim() : 'Cliente';
    const command = {
      to: phone,
      kind: 'template' as const,
      templateName,
      languageCode,
      templateComponents: buildLeadFormWelcomeTemplateComponents(contactName),
    };
    this.logger.log(
      `Delayed outbound template send start template=${templateName} lang=${languageCode} to=${phone} leadgenId=${job.leadgenId}`,
    );
    let result: LeadSendResult;
    try {
      result = await lastValueFrom(
        this.wsMsClient
          .send<LeadSendResult>(LEAD_CONVERSATION_SEND_PATTERN, command)
          .pipe(timeout(LEAD_SEND_RPC_TIMEOUT_MS)),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.metaLeadCampaignModel.updateOne(
        { leadgenId: job.leadgenId },
        { $set: { qualificationOutboundError: message } },
      );
      this.logger.warn(
        `Delayed outbound template FAILED leadgenId=${job.leadgenId} to=${phone} error=${message}`,
      );
      return;
    }
    if (!result.success || result.wamid == null || result.wamid.trim() === '') {
      const error = result.error ?? 'send failed';
      await this.metaLeadCampaignModel.updateOne(
        { leadgenId: job.leadgenId },
        { $set: { qualificationOutboundError: error } },
      );
      this.logger.warn(
        `Delayed outbound template FAILED leadgenId=${job.leadgenId} to=${phone} error=${error}`,
      );
      return;
    }
    await this.metaLeadCampaignModel.updateOne(
      { leadgenId: job.leadgenId },
      {
        $set: {
          qualificationOutboundSentAt: new Date(),
          qualificationWhatsappMessageId: result.wamid,
          qualificationOutboundError: undefined,
          customerId:
            campaign.customerId ??
            (Types.ObjectId.isValid(job.customerId)
              ? new Types.ObjectId(job.customerId)
              : campaign.customerId),
        },
      },
    );
    this.logger.log(
      `Delayed outbound template OK leadgenId=${job.leadgenId} to=${phone} wamid=${result.wamid}`,
    );
  }
}
