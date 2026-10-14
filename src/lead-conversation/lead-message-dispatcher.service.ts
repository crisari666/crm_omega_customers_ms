import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { LEAD_OUTBOUND_JOB, LEAD_OUTBOUND_QUEUE } from './constants/lead-conversation.constants';
import type { LeadOutboundJobData } from './types/lead-job-data.type';
import type { OutboundMessagePlan } from './types/outbound-message-plan.type';

const SEND_ATTEMPTS = 3 as const;
const SEND_BACKOFF_MS = 2000 as const;
const KEEP_FAILED_JOBS = 200 as const;

/** Enqueues outbound message sequences; pauses between messages are BullMQ job delays. */
@Injectable()
export class LeadMessageDispatcherService {
  constructor(@InjectQueue(LEAD_OUTBOUND_QUEUE) private readonly outboundQueue: Queue<LeadOutboundJobData>) {}

  async executeDispatch(input: {
    readonly sessionId: string;
    readonly customerId: string;
    readonly to: string;
    readonly messages: readonly OutboundMessagePlan[];
    readonly questionAt?: Date;
  }): Promise<void> {
    if (input.messages.length === 0) return;
    await this.executeEnqueueStep({
      sessionId: input.sessionId,
      customerId: input.customerId,
      to: input.to,
      messages: input.messages,
      index: 0,
      ...(input.questionAt ? { questionAt: input.questionAt.toISOString() } : {}),
    });
  }

  async executeEnqueueStep(data: LeadOutboundJobData): Promise<void> {
    await this.outboundQueue.add(LEAD_OUTBOUND_JOB, data, {
      delay: data.messages[data.index]?.delayMs ?? 0,
      attempts: SEND_ATTEMPTS,
      backoff: { type: 'exponential', delay: SEND_BACKOFF_MS },
      removeOnComplete: true,
      removeOnFail: KEEP_FAILED_JOBS,
    });
  }
}
