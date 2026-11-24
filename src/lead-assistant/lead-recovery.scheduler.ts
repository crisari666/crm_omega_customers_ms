import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  LEAD_AGENT_RECOVERY_JOB,
  LEAD_AGENT_RECOVERY_QUEUE,
  RECOVERY_CLOSE_AFTER_HOURS,
} from '../lead-conversation/constants/lead-conversation.constants';
import { MS_PER_HOUR } from './constants/lead-assistant.constants';
import { LeadRecoverySequenceService } from './lead-recovery-sequence.service';
import type { LeadRecoveryJobData } from './types/lead-recovery-job-data.type';
import type { LeadRecoveryScheduleInput } from './types/lead-recovery-schedule-input.type';
import type { LeadRecoveryStep } from './types/lead-recovery-step.type';

const buildRecoveryJobId = (sessionId: string): string => `recovery-${sessionId}`;

/**
 * Arms / cancels the single delayed recovery job of a session (next follow-up or closing job).
 */
@Injectable()
export class LeadRecoveryScheduler {
  private readonly logger = new Logger(LeadRecoveryScheduler.name);

  constructor(
    @InjectQueue(LEAD_AGENT_RECOVERY_QUEUE) private readonly recoveryQueue: Queue<LeadRecoveryJobData>,
    private readonly leadRecoverySequenceService: LeadRecoverySequenceService,
  ) {}

  /**
   * Schedules the first enabled step (by offset) not yet sent. When every enabled step was sent,
   * schedules a closing job (`stepId: null`). With no enabled steps nothing is scheduled.
   */
  async executeScheduleNext(input: LeadRecoveryScheduleInput): Promise<void> {
    await this.executeCancel(input.sessionId);
    const { steps } = await this.leadRecoverySequenceService.executeGet();
    const enabledSteps = steps.filter((step) => step.enabled);
    if (enabledSteps.length === 0) {
      return;
    }
    const nextStep = this.pickNextStep(enabledSteps, input.sentStepIds);
    const delay =
      nextStep != null
        ? Math.max(0, new Date(input.anchorAt).getTime() + nextStep.offsetHours * MS_PER_HOUR - Date.now())
        : RECOVERY_CLOSE_AFTER_HOURS * MS_PER_HOUR;
    await this.recoveryQueue.add(
      LEAD_AGENT_RECOVERY_JOB,
      { sessionId: input.sessionId, stepId: nextStep?.id ?? null, anchorAt: input.anchorAt },
      { jobId: buildRecoveryJobId(input.sessionId), delay, removeOnComplete: true, removeOnFail: true },
    );
  }

  /** Best effort: the processor re-checks the session, so a missed cancel is harmless. */
  async executeCancel(sessionId: string): Promise<void> {
    try {
      await this.recoveryQueue.remove(buildRecoveryJobId(sessionId));
    } catch (err) {
      this.logger.debug(
        `Recovery cancel skipped for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private pickNextStep(
    enabledSteps: readonly LeadRecoveryStep[],
    sentStepIds: readonly string[],
  ): LeadRecoveryStep | undefined {
    return [...enabledSteps]
      .sort((first, second) => first.offsetHours - second.offsetHours)
      .find((step) => !sentStepIds.includes(step.id));
  }
}
