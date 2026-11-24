import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LeadConversationMessage,
  LeadConversationMessageDocument,
} from '../lead-conversation/schemas/lead-conversation-message.schema';
import {
  LeadConversationSession,
  LeadConversationSessionDocument,
} from '../lead-conversation/schemas/lead-conversation-session.schema';
import { LeadConversationStep } from '../lead-conversation/types/lead-conversation-step.enum';
import { buildLeadAgentSessionReset } from '../lead-conversation/utils/build-lead-agent-session-reset.util';

const ADOPTABLE_ACTIVE_STEPS: readonly LeadConversationStep[] = [
  LeadConversationStep.Initial,
  LeadConversationStep.AskProject,
];

type AdoptableSession = Pick<
  LeadConversationSession,
  'flowVersion' | 'status' | 'step' | 'score'
> & { readonly _id: LeadConversationSessionDocument['_id'] };

/**
 * Moves an existing V1 session of a phone into the V2 agent flow when a `lead_conversation_v2` Lead Ads form
 * arrives for it. Sessions that already progressed (or are booked) are never touched.
 */
@Injectable()
export class LeadAgentSessionAdoptionService {
  private readonly logger = new Logger(LeadAgentSessionAdoptionService.name);

  constructor(
    @InjectModel(LeadConversationSession.name)
    private readonly sessionModel: Model<LeadConversationSessionDocument>,
    @InjectModel(LeadConversationMessage.name)
    private readonly messageModel: Model<LeadConversationMessageDocument>,
  ) {}

  /** Converts the newest session of `phone` to V2 when it is brand new or closed without a booking. */
  async executeAdopt(input: { readonly phone: string; readonly formId?: string }): Promise<void> {
    const waId = input.phone.replace(/\D/g, '');
    if (waId.length === 0) return;
    const session = (await this.sessionModel
      .findOne({ waId })
      .sort({ createdAt: -1 })
      .select({ flowVersion: 1, status: 1, step: 1, score: 1 })
      .lean()
      .exec()) as AdoptableSession | null;
    if (session === null || session.flowVersion === 'v2' || session.status === 'scheduled') return;
    const isFreshActive =
      session.status === 'active' && ADOPTABLE_ACTIVE_STEPS.includes(session.step) && session.score === 0;
    const isClosed = session.status === 'disqualified' || session.status === 'abandoned';
    if (!isFreshActive && !isClosed) return;
    const lastTurnMessageId = await this.findLastInboundId(session);
    const reset = buildLeadAgentSessionReset({
      ...(input.formId ? { formId: input.formId } : {}),
      ...(lastTurnMessageId ? { lastTurnMessageId } : {}),
    });
    await this.sessionModel
      .updateOne(
        { _id: session._id, flowVersion: { $ne: 'v2' } },
        { $set: reset.$set, $unset: reset.$unset, $inc: { version: 1 } },
      )
      .exec();
    this.logger.log(`Lead session ${String(session._id)} adopted by the V2 agent flow (waId=${waId})`);
  }

  /** Inbound already stored, so the first agent turn only answers newer messages. */
  private async findLastInboundId(session: AdoptableSession): Promise<string | undefined> {
    const lastInbound = await this.messageModel
      .findOne({ sessionId: session._id, direction: 'inbound' })
      .sort({ _id: -1 })
      .select({ _id: 1 })
      .lean()
      .exec();
    return lastInbound ? String(lastInbound._id) : undefined;
  }
}
