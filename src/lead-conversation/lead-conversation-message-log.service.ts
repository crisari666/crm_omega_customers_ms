import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LeadConversationMessage,
  LeadConversationMessageDocument,
} from './schemas/lead-conversation-message.schema';
import type { InboundLeadMessage } from './types/inbound-lead-message.type';
import type { OutboundMessagePlan } from './types/outbound-message-plan.type';

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
  }): Promise<void> {
    await this.messageModel.create({
      sessionId: input.sessionId,
      customerId: input.customerId,
      ...(input.wamid ? { wamid: input.wamid } : {}),
      direction: 'outbound',
      kind: input.plan.kind,
      body: input.plan.body ?? '',
      options: (input.plan.options ?? []).map((option) => option.title),
      mediaUrl: input.plan.mediaUrl,
      delivered: input.delivered,
      timestamp: new Date(),
    });
  }
}
