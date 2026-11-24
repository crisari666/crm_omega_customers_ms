import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { LeadAssistantSettingsService } from '../../lead-assistant/lead-assistant-settings.service';
import { LeadRecoverySequenceService } from '../../lead-assistant/lead-recovery-sequence.service';
import { LeadRecoveryScheduler } from '../../lead-assistant/lead-recovery.scheduler';
import { LEAD_AGENT_TURN_JOB, LEAD_AGENT_TURN_QUEUE } from '../constants/lead-conversation.constants';
import { LeadConversationMessageLogService } from '../lead-conversation-message-log.service';
import { LeadConversationSessionService, type LeadSessionSnapshot } from '../lead-conversation-session.service';
import { LeadWhatsappSenderService } from '../lead-whatsapp-sender.service';
import type { InboundLeadMessage } from '../types/inbound-lead-message.type';
import { LeadConversationStep } from '../types/lead-conversation-step.enum';
import type { StepTransition } from '../types/step-transition.type';
import { LeadAgentSideEffectsService } from './lead-agent-side-effects.service';
import { LeadAgentSlotBridgeService } from './lead-agent-slot-bridge.service';
import type { LeadAgentTurnJobData } from './types/lead-agent-turn-job-data.type';

const MAX_SLOT_ATTEMPTS = 3 as const;
const MS_PER_SECOND = 1000 as const;

const SLOT_CHOICE_STEPS: readonly LeadConversationStep[] = [
  LeadConversationStep.AskSchedule,
  LeadConversationStep.AskCallSlot,
];

/**
 * Entry point of the V2 flow for one inbound message: stops the recovery job, honours opt-out/disabled settings,
 * resolves call slot choices synchronously and otherwise arms the debounced agent turn.
 */
@Injectable()
export class LeadAgentInboundService {
  private readonly logger = new Logger(LeadAgentInboundService.name);

  constructor(
    @InjectQueue(LEAD_AGENT_TURN_QUEUE) private readonly turnQueue: Queue<LeadAgentTurnJobData>,
    private readonly settingsService: LeadAssistantSettingsService,
    private readonly recoveryScheduler: LeadRecoveryScheduler,
    private readonly recoverySequence: LeadRecoverySequenceService,
    private readonly sender: LeadWhatsappSenderService,
    private readonly slotBridge: LeadAgentSlotBridgeService,
    private readonly sessionService: LeadConversationSessionService,
    private readonly messageLog: LeadConversationMessageLogService,
    private readonly sideEffects: LeadAgentSideEffectsService,
  ) {}

  /** Handles one stored inbound message of a V2 session; never answers synchronously except slot choices. */
  async executeHandle(session: LeadSessionSnapshot, message: InboundLeadMessage): Promise<void> {
    await this.executeStopRecovery(session);
    const settings = await this.settingsService.executeGetOrCreate();
    if (!settings.enabled || session.optedOutAt || session.status === 'disqualified') return;
    void this.sender.executeMarkRead(message.wamid).catch(() => undefined);
    if (SLOT_CHOICE_STEPS.includes(session.step) && (await this.executeHandleSlotChoice(session, message))) return;
    await this.turnQueue.add(
      LEAD_AGENT_TURN_JOB,
      { sessionId: String(session._id), wamid: message.wamid },
      {
        jobId: `turn-${String(session._id)}-${message.wamid}`,
        delay: settings.replyDebounceSeconds * MS_PER_SECOND,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /** The customer replied: drop the pending recovery job, count the reply, and re-enter discovery. */
  private async executeStopRecovery(session: LeadSessionSnapshot): Promise<void> {
    await this.recoveryScheduler.executeCancel(String(session._id));
    const lastStepId = (session.recovery?.sentStepIds ?? []).slice(-1)[0];
    if (!lastStepId) return;
    await this.recoverySequence
      .executeIncrementReplied(lastStepId)
      .catch((err: unknown) => this.logger.warn(`Recovery reply count failed for ${lastStepId}: ${String(err)}`));
    await this.sessionService
      .reenterDiscoveryAfterRecovery(session._id)
      .catch((err: unknown) =>
        this.logger.warn(`Recovery discovery re-entry failed for ${String(session._id)}: ${String(err)}`),
      );
  }

  /** Returns true when the message was a slot choice that got applied (and its side effects ran). */
  private async executeHandleSlotChoice(initialSession: LeadSessionSnapshot, message: InboundLeadMessage): Promise<boolean> {
    const lastTurnMessageId = await this.findStoredMessageId(initialSession, message);
    let session: LeadSessionSnapshot | null = initialSession;
    for (let attempt = 0; attempt < MAX_SLOT_ATTEMPTS && session; attempt += 1) {
      const transition = await this.slotBridge.executeTryHandle(session, message, lastTurnMessageId);
      if (transition === null) return false;
      const updated = await this.sessionService.applyTransition(
        session,
        this.withRecoveryAnchor(transition, message),
        message.timestamp,
      );
      if (updated) {
        await this.sideEffects.executeRun({ session: updated, transition });
        return true;
      }
      session = await this.sessionService.findById(String(initialSession._id));
    }
    this.logger.warn(`Lead session ${String(initialSession._id)} slot transition conflict for ${message.wamid}`);
    return false;
  }

  private withRecoveryAnchor(transition: StepTransition, message: InboundLeadMessage): StepTransition {
    return {
      ...transition,
      sessionPatch: { ...transition.sessionPatch, recovery: { anchorAt: message.timestamp, sentStepIds: [] } },
    };
  }

  /** Transcript id of the inbound message, so the next agent turn does not answer it again. */
  private async findStoredMessageId(session: LeadSessionSnapshot, message: InboundLeadMessage): Promise<string | undefined> {
    const latest = await this.messageLog.findLatestInbound(session._id);
    const latestWithId = latest as ({ _id?: unknown; wamid?: string } | null);
    return latestWithId?.wamid === message.wamid && latestWithId._id ? String(latestWithId._id) : undefined;
  }
}
