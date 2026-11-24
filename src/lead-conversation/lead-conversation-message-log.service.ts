import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, Types } from 'mongoose';
import type { InboundLeadStatus } from './types/inbound-lead-status.type';
import {
  LeadConversationMessage,
  LeadConversationMessageDocument,
} from './schemas/lead-conversation-message.schema';
import type { InboundLeadMessage } from './types/inbound-lead-message.type';
import type { OutboundMessagePlan } from './types/outbound-message-plan.type';
import { buildLeadVentorContactSummary } from './utils/build-lead-ventor-contact-plan.util';
import { resolveNextDeliveryStatus } from './utils/resolve-next-delivery-status.util';

const MONGO_DUPLICATE_KEY_CODE = 11000;

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === MONGO_DUPLICATE_KEY_CODE;

/** Transcript persistence; the unique `wamid` index makes inbound processing idempotent. */
@Injectable()
export class LeadConversationMessageLogService {
  constructor(
    @InjectModel(LeadConversationMessage.name)
    private readonly messageModel: Model<LeadConversationMessageDocument>,
  ) {}

  /** Returns false when this wamid was already stored (Meta retry / duplicate delivery). */
  async saveInboundIfNew(input: {
    readonly sessionId: Types.ObjectId;
    readonly customerId: Types.ObjectId;
    readonly message: InboundLeadMessage;
  }): Promise<boolean> {
    try {
      await this.messageModel.create({
        sessionId: input.sessionId,
        customerId: input.customerId,
        wamid: input.message.wamid,
        direction: 'inbound',
        kind: input.message.type,
        body: input.message.text,
        interactiveReplyId: input.message.replyId,
        timestamp: input.message.timestamp,
      });
      return true;
    } catch (err) {
      if (isDuplicateKeyError(err)) return false;
      throw err;
    }
  }

  async saveOutbound(input: {
    readonly sessionId: Types.ObjectId;
    readonly customerId: Types.ObjectId;
    readonly plan: OutboundMessagePlan;
    readonly wamid?: string;
    readonly delivered: boolean;
    readonly errorCode?: number;
  }): Promise<void> {
    const body =
      input.plan.kind === 'contacts' && input.plan.contact != null
        ? buildLeadVentorContactSummary(input.plan.contact)
        : (input.plan.body ?? '');
    await this.messageModel.create({
      sessionId: input.sessionId,
      customerId: input.customerId,
      ...(input.wamid ? { wamid: input.wamid } : {}),
      direction: 'outbound',
      kind: input.plan.kind,
      body,
      options: (input.plan.options ?? []).map((option) => option.title),
      mediaUrl: input.plan.mediaUrl,
      ...(input.plan.templateName ? { templateName: input.plan.templateName } : {}),
      ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
      delivered: input.delivered,
      timestamp: new Date(),
    });
  }

  /** Most recent inbound message of the session, or null. */
  async findLatestInbound(sessionId: Types.ObjectId): Promise<LeadConversationMessage | null> {
    return this.messageModel
      .findOne({ sessionId, direction: 'inbound' })
      .sort({ _id: -1 })
      .lean()
      .exec() as Promise<LeadConversationMessage | null>;
  }

  /** Inbound messages newer than `afterId` (all when omitted), oldest first. */
  async findInboundAfter(sessionId: Types.ObjectId, afterId?: Types.ObjectId): Promise<LeadConversationMessage[]> {
    const filter: QueryFilter<LeadConversationMessageDocument> = {
      sessionId,
      direction: 'inbound',
      ...(afterId ? { _id: { $gt: afterId } } : {}),
    };
    return this.messageModel.find(filter).sort({ _id: 1 }).lean().exec() as Promise<LeadConversationMessage[]>;
  }

  /** Last `limit` messages of the session in chronological order. */
  async findRecent(sessionId: Types.ObjectId, limit: number): Promise<LeadConversationMessage[]> {
    const rows = (await this.messageModel
      .find({ sessionId })
      .sort({ _id: -1 })
      .limit(limit)
      .lean()
      .exec()) as LeadConversationMessage[];
    return rows.reverse();
  }

  /** Applies a Meta delivery status to the matching outbound message; never downgrades. */
  async applyDeliveryStatus(input: Pick<InboundLeadStatus, 'wamid' | 'status'> & { readonly errorCode?: number }): Promise<void> {
    const current = (await this.messageModel
      .findOne({ wamid: input.wamid, direction: 'outbound' })
      .select({ deliveryStatus: 1 })
      .lean()
      .exec()) as { _id: Types.ObjectId; deliveryStatus?: string } | null;
    if (!current) return;
    const next = resolveNextDeliveryStatus(current.deliveryStatus, input.status);
    if (!next) return;
    const isFailed = next === 'failed';
    await this.messageModel
      .updateOne(
        { _id: current._id },
        {
          $set: {
            deliveryStatus: next,
            ...(isFailed ? { delivered: false } : {}),
            ...(isFailed && input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
          },
        },
      )
      .exec();
  }
}
