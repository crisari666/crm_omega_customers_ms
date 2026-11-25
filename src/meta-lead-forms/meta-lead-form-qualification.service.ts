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
import { LeadAssistantSettingsService } from '../lead-assistant/lead-assistant-settings.service';
import { LeadRecoveryScheduler } from '../lead-assistant/lead-recovery.scheduler';
import { LeadTemplateRendererService } from '../lead-assistant/lead-template-renderer.service';
import {
  LeadConversationMessage,
  LeadConversationMessageDocument,
} from '../lead-conversation/schemas/lead-conversation-message.schema';
import {
  LeadConversationSession,
  LeadConversationSessionDocument,
} from '../lead-conversation/schemas/lead-conversation-session.schema';
import { LeadConversationStep } from '../lead-conversation/types/lead-conversation-step.enum';
import { extractFirstName } from '../lead-conversation/utils/extract-first-name.util';
import {
  MetaLeadCampaign,
  MetaLeadCampaignDocument,
} from '../customer/schemas/meta-lead-campaign.schema';
import {
  DEFAULT_LEAD_FORM_TEMPLATE_LANGUAGE,
  DEFAULT_LEAD_FORM_TEMPLATE_NAME,
} from './constants/meta-lead-form.constants';
import { MetaLeadAdCampaignLookupService } from './meta-lead-ad-campaign-lookup.service';
import type { LeadAgentWelcomeOutbound } from './types/lead-agent-welcome-outbound.type';
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
    @InjectModel(LeadConversationMessage.name)
    private readonly messageModel: Model<LeadConversationMessageDocument>,
    @Inject(LEAD_WS_MS_CLIENT) private readonly wsMsClient: ClientProxy,
    private readonly configService: ConfigService,
    private readonly settingsService: LeadAssistantSettingsService,
    private readonly templateRenderer: LeadTemplateRendererService,
    private readonly recoveryScheduler: LeadRecoveryScheduler,
    private readonly adCampaignLookup: MetaLeadAdCampaignLookupService,
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
    if (existingSession != null && (await this.hasInboundAfterLeadForm(job, existingSession.lastInboundAt))) {
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
    const agentWelcome =
      job.flowStrategy === 'lead_conversation_v2'
        ? await this.buildAgentWelcome(job, campaign)
        : null;
    const templateName =
      agentWelcome?.templateName ??
      (this.configService.get<string>('metaLeadForms.welcomeTemplateName')?.trim() ||
        DEFAULT_LEAD_FORM_TEMPLATE_NAME);
    const languageCode =
      agentWelcome?.languageCode ??
      (this.configService.get<string>('metaLeadForms.welcomeTemplateLanguage')?.trim() ||
        DEFAULT_LEAD_FORM_TEMPLATE_LANGUAGE);
    const contactName =
      job.contactName.trim().length > 0 ? job.contactName.trim() : 'Cliente';
    const command = {
      to: phone,
      kind: 'template' as const,
      templateName,
      languageCode,
      templateComponents:
        agentWelcome?.templateComponents ?? buildLeadFormWelcomeTemplateComponents(contactName),
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
    if (agentWelcome != null) {
      await this.executeStartAgentSession({ job, phone, wamid: result.wamid, welcome: agentWelcome });
    }
  }

  /**
   * V1 jobs skip on any earlier inbound. V2 jobs only skip when the customer wrote after submitting the form,
   * so a lead adopted from an old closed conversation still gets the welcome.
   */
  private async hasInboundAfterLeadForm(
    job: MetaLeadFormQualificationJobData,
    lastInboundAt: Date | undefined,
  ): Promise<boolean> {
    if (job.flowStrategy !== 'lead_conversation_v2') {
      return true;
    }
    const campaign = (await this.metaLeadCampaignModel
      .findOne({ leadgenId: job.leadgenId })
      .select({ createdAt: 1 })
      .lean()
      .exec()) as { createdAt?: Date } | null;
    if (campaign?.createdAt == null || lastInboundAt == null) {
      return true;
    }
    return new Date(lastInboundAt).getTime() >= new Date(campaign.createdAt).getTime();
  }

  /**
   * V2 welcome: the assistant welcome template rendered with the lead data.
   * Null (V1 template path) when the assistant is disabled or has no welcome template.
   */
  private async buildAgentWelcome(
    job: MetaLeadFormQualificationJobData,
    campaign: Pick<MetaLeadCampaign, 'graphCampaignId'>,
  ): Promise<LeadAgentWelcomeOutbound | null> {
    const settings = await this.settingsService.executeGetOrCreate();
    const welcomeTemplate = settings.welcomeTemplate;
    if (!settings.enabled || welcomeTemplate == null) {
      return null;
    }
    const adCampaign =
      campaign.graphCampaignId != null
        ? await this.adCampaignLookup.executeFindEnabledByCampaignId(campaign.graphCampaignId)
        : null;
    const projectId = adCampaign?.projectId?.trim() || undefined;
    const projectTitle = adCampaign?.projectTitle?.trim() || undefined;
    const { templateComponents, renderedBody } = this.templateRenderer.executeRender(welcomeTemplate, {
      firstName: extractFirstName(job.contactName),
      assistantName: settings.assistantName,
      businessName: settings.businessName,
      projectTitle,
    });
    return {
      templateName: welcomeTemplate.name,
      languageCode: welcomeTemplate.language,
      templateComponents,
      renderedBody,
      ...(projectId !== undefined
        ? {
            projectId,
            ...(projectTitle !== undefined ? { projectTitle } : {}),
          }
        : {}),
    };
  }

  /** After the welcome was sent: V2 session waiting for the reply, transcript row and recovery clock. */
  private async executeStartAgentSession(input: {
    readonly job: MetaLeadFormQualificationJobData;
    readonly phone: string;
    readonly wamid: string;
    readonly welcome: LeadAgentWelcomeOutbound;
  }): Promise<void> {
    const { job, phone, wamid, welcome } = input;
    const phoneNumberId = this.configService.get<string>('leadConversation.phoneNumberId')?.trim();
    if (!phoneNumberId || !Types.ObjectId.isValid(job.customerId)) {
      this.logger.warn(`V2 session not started: missing phoneNumberId or customerId leadgenId=${job.leadgenId}`);
      return;
    }
    try {
      const customerId = new Types.ObjectId(job.customerId);
      const now = new Date();
      const session = await this.sessionModel
        .findOneAndUpdate(
          { waId: phone, phoneNumberId },
          {
            $set: {
              flowVersion: 'v2',
              ...(job.formId ? { formId: job.formId } : {}),
              step: LeadConversationStep.V2Conversation,
              leadProfile: { stage: 'opening', stageTurns: 0 },
              recovery: { anchorAt: now, sentStepIds: [] },
              ...(welcome.projectId !== undefined
                ? {
                    projectId: welcome.projectId,
                    ...(welcome.projectTitle !== undefined
                      ? { projectTitle: welcome.projectTitle }
                      : {}),
                  }
                : {}),
            },
            $setOnInsert: {
              customerId,
              waId: phone,
              phoneNumberId,
              profileName: job.contactName,
              firstName: extractFirstName(job.contactName),
              status: 'active',
            },
            $inc: { version: 1 },
          },
          { upsert: true, new: true, lean: true },
        )
        .exec();
      await this.messageModel.create({
        sessionId: session._id,
        customerId,
        wamid,
        direction: 'outbound',
        kind: 'template',
        body: welcome.renderedBody,
        templateName: welcome.templateName,
        delivered: true,
        timestamp: now,
      });
      await this.recoveryScheduler.executeScheduleNext({
        sessionId: String(session._id),
        anchorAt: now.toISOString(),
        sentStepIds: [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`V2 session start FAILED leadgenId=${job.leadgenId} error=${message}`);
    }
  }
}
