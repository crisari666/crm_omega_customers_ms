import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LeadAssistantSettingsService } from '../../lead-assistant/lead-assistant-settings.service';
import { MetaLeadCampaign, MetaLeadCampaignDocument } from '../../customer/schemas/meta-lead-campaign.schema';
import { LeadConversationSessionService, type LeadSessionSnapshot } from '../lead-conversation-session.service';
import {
  LeadConversationSession,
  LeadConversationSessionDocument,
} from '../schemas/lead-conversation-session.schema';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadFlowResolution } from './types/lead-flow-resolution.type';

/**
 * Decides which flow answers an inbound message. Sessions already on V2 stay on V2; only a brand-new session
 * (step `initial`, nothing asked yet) can be converted. When the lead assistant is enabled, fresh sessions
 * always become V2 (including after admin delete). Mid-flight V1 sessions stay V1 until admin restart.
 */
@Injectable()
export class LeadFlowResolverService {
  constructor(
    @InjectModel(MetaLeadCampaign.name)
    private readonly campaignModel: Model<MetaLeadCampaignDocument>,
    @InjectModel(LeadConversationSession.name)
    private readonly sessionModel: Model<LeadConversationSessionDocument>,
    private readonly settingsService: LeadAssistantSettingsService,
    private readonly sessionService: LeadConversationSessionService,
  ) {}

  /** Returns the flow for the session; on a V1→V2 conversion `session` is the fresh converted snapshot. */
  async executeResolve(session: LeadSessionSnapshot): Promise<LeadFlowResolution> {
    if (session.flowVersion === 'v2') return { flowVersion: 'v2', session };
    if (!this.isFreshSession(session)) return { flowVersion: 'v1', session };
    const settings = await this.settingsService.executeGetOrCreate();
    if (!settings.enabled) return { flowVersion: 'v1', session };
    const campaign = await this.findNewestStrategyCampaign(session);
    return this.convertToV2(session, campaign?.formId ?? campaign?.graphFormId);
  }

  private isFreshSession(session: LeadSessionSnapshot): boolean {
    return session.step === LeadConversationStep.Initial && !session.lastQuestionAt;
  }

  private async findNewestStrategyCampaign(
    session: LeadSessionSnapshot,
  ): Promise<Pick<MetaLeadCampaign, 'flowStrategy' | 'formId' | 'graphFormId'> | null> {
    return this.campaignModel
      .findOne({ customerId: session.customerId, flowStrategy: { $exists: true, $ne: null } })
      .sort({ createdAt: -1 })
      .select({ flowStrategy: 1, formId: 1, graphFormId: 1 })
      .lean()
      .exec();
  }

  private async convertToV2(session: LeadSessionSnapshot, formId?: string): Promise<LeadFlowResolution> {
    const converted = (await this.sessionModel
      .findOneAndUpdate(
        { _id: session._id, flowVersion: { $ne: 'v2' } },
        {
          $set: {
            flowVersion: 'v2',
            ...(formId ? { formId } : {}),
            step: LeadConversationStep.V2Conversation,
            leadProfile: { stage: 'opening', stageTurns: 0 },
          },
          $inc: { version: 1 },
        },
        { new: true, lean: true },
      )
      .exec()) as LeadSessionSnapshot | null;
    if (converted) return { flowVersion: 'v2', session: converted };
    const refreshed = await this.sessionService.findById(String(session._id));
    return refreshed?.flowVersion === 'v2'
      ? { flowVersion: 'v2', session: refreshed }
      : { flowVersion: 'v1', session: refreshed ?? session };
  }
}
