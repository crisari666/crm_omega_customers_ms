import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LeadAssistantSettingsService } from '../../lead-assistant/lead-assistant-settings.service';
import type { LeadAssistantSettingsView } from '../../lead-assistant/types/lead-assistant-settings-view.type';
import { MetaLeadCampaign, MetaLeadCampaignDocument } from '../../customer/schemas/meta-lead-campaign.schema';
import { LeadConversationSessionService, type LeadSessionSnapshot } from '../lead-conversation-session.service';
import {
  LeadConversationSession,
  LeadConversationSessionDocument,
} from '../schemas/lead-conversation-session.schema';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { LeadFlowVersion } from '../types/lead-flow-version.type';
import type { LeadFlowResolution } from './types/lead-flow-resolution.type';

const V2_FLOW_STRATEGY = 'lead_conversation_v2' as const;

/**
 * Decides which flow answers an inbound message. Sessions already on V2 stay on V2; only a brand-new session
 * (step `initial`, nothing asked yet) can be converted, driven by the newest campaign strategy of its customer.
 * Every other session keeps the V1 behavior untouched.
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
    const campaign = await this.findNewestStrategyCampaign(session);
    const settings = await this.settingsService.executeGetOrCreate();
    const target = this.resolveTargetFlow(campaign?.flowStrategy, settings);
    if (target !== 'v2' || !settings.enabled) return { flowVersion: 'v1', session };
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

  private resolveTargetFlow(
    flowStrategy: MetaLeadCampaign['flowStrategy'] | undefined,
    settings: LeadAssistantSettingsView,
  ): LeadFlowVersion {
    if (flowStrategy === undefined || flowStrategy === null) return settings.defaultInboundFlow;
    return flowStrategy === V2_FLOW_STRATEGY ? 'v2' : 'v1';
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
