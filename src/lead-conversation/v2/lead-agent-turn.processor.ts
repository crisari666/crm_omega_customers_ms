import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { LEAD_AGENT_HISTORY_LIMIT, LEAD_AGENT_TURN_QUEUE } from '../constants/lead-conversation.constants';
import { LeadConversationMessageLogService } from '../lead-conversation-message-log.service';
import { LeadConversationSessionService, type LeadSessionSnapshot } from '../lead-conversation-session.service';
import type { LeadConversationMessage } from '../schemas/lead-conversation-message.schema';
import type { StepTransition } from '../types/step-transition.type';
import { isInstantFormDump } from '../utils/extract-form-fields-from-lead-text.util';
import { LeadAgentEngineService } from './lead-agent-engine.service';
import { LeadAgentSideEffectsService } from './lead-agent-side-effects.service';
import type { LeadAgentHistoryMessage } from './types/lead-agent-history-message.type';
import type { LeadAgentPendingMessage } from './types/lead-agent-pending-message.type';
import type { LeadAgentTurnJobData } from './types/lead-agent-turn-job-data.type';
import type { LeadAgentTurnOutcome } from './types/lead-agent-turn-outcome.type';
import { buildLeadAgentSessionView } from './utils/build-lead-agent-session-view.util';

const MAX_TURN_ATTEMPTS = 3 as const;
const TURN_CONCURRENCY = 5 as const;

type StoredMessage = LeadConversationMessage & { readonly _id: Types.ObjectId };

type LoadedTurn = {
  readonly session: LeadSessionSnapshot;
  readonly latest: StoredMessage;
  readonly pending: readonly StoredMessage[];
};

/**
 * Debounced V2 agent turn: answers every customer message not answered yet in one reply,
 * unless a newer inbound message armed a newer job.
 */
@Processor(LEAD_AGENT_TURN_QUEUE, { concurrency: TURN_CONCURRENCY })
export class LeadAgentTurnProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadAgentTurnProcessor.name);

  constructor(
    private readonly sessionService: LeadConversationSessionService,
    private readonly messageLog: LeadConversationMessageLogService,
    private readonly engine: LeadAgentEngineService,
    private readonly sideEffects: LeadAgentSideEffectsService,
  ) {
    super();
  }

  async process(job: Job<LeadAgentTurnJobData>): Promise<void> {
    for (let attempt = 1; attempt <= MAX_TURN_ATTEMPTS; attempt += 1) {
      const loaded = await this.executeLoad(job.data);
      if (loaded === null) return;
      const outcome = await this.executeEngineTurn(loaded);
      const updated = await this.sessionService.applyTransition(
        loaded.session,
        this.buildTransition(outcome, loaded.latest),
        loaded.latest.timestamp,
      );
      if (updated) {
        await this.sideEffects.executeRun({
          session: updated,
          transition: outcome.transition,
          usedFaqIds: outcome.usedFaqIds,
          ...(outcome.unansweredQuestion !== undefined ? { unansweredQuestion: outcome.unansweredQuestion } : {}),
        });
        return;
      }
      this.logger.warn(`Agent turn ${job.data.sessionId} lock conflict (attempt ${attempt}/${MAX_TURN_ATTEMPTS})`);
    }
    this.logger.warn(`Agent turn ${job.data.sessionId} dropped after ${MAX_TURN_ATTEMPTS} conflicts`);
  }

  /** Null when there is nothing to answer: no session, not V2, closed, superseded job or no new messages. */
  private async executeLoad(data: LeadAgentTurnJobData): Promise<LoadedTurn | null> {
    const session = await this.sessionService.findById(data.sessionId);
    if (!session || session.flowVersion !== 'v2') return null;
    if (session.optedOutAt || session.status === 'disqualified') return null;
    const latest = (await this.messageLog.findLatestInbound(session._id)) as StoredMessage | null;
    if (!latest || latest.wamid !== data.wamid) return null;
    const afterId = session.lastTurnMessageId ? new Types.ObjectId(session.lastTurnMessageId) : undefined;
    const pending = (await this.messageLog.findInboundAfter(session._id, afterId)) as StoredMessage[];
    return pending.length === 0 ? null : { session, latest, pending };
  }

  private async executeEngineTurn({ session, pending }: LoadedTurn): Promise<LeadAgentTurnOutcome> {
    const recent = (await this.messageLog.findRecent(session._id, LEAD_AGENT_HISTORY_LIMIT)) as StoredMessage[];
    const pendingIds = new Set(pending.map((message) => String(message._id)));
    return this.engine.executeTurn({
      session: buildLeadAgentSessionView(session),
      history: recent.filter((row) => !pendingIds.has(String(row._id))).map(toHistoryMessage),
      pendingMessages: pending.map(toPendingMessage),
    });
  }

  /** Marks the answered inbound message and restarts the recovery clock from it. */
  private buildTransition(outcome: LeadAgentTurnOutcome, latest: StoredMessage): StepTransition {
    return {
      ...outcome.transition,
      sessionPatch: {
        ...outcome.transition.sessionPatch,
        lastTurnMessageId: String(latest._id),
        recovery: { anchorAt: latest.timestamp, sentStepIds: [] },
      },
    };
  }
}

const toHistoryMessage = (row: LeadConversationMessage): LeadAgentHistoryMessage => ({
  direction: row.direction,
  body: row.body ?? '',
});

const toPendingMessage = (row: LeadConversationMessage): LeadAgentPendingMessage => ({
  text: row.body ?? '',
  ...(isInstantFormDump(row.body ?? '') ? { isInstantFormDump: true } : {}),
  ...(row.interactiveReplyId !== undefined && row.interactiveReplyId.length > 0
    ? { replyId: row.interactiveReplyId }
    : {}),
});
