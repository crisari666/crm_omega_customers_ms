import {
  LEAD_AGENT_RECOVERY_JOB,
  RECOVERY_CLOSE_AFTER_HOURS,
} from '../lead-conversation/constants/lead-conversation.constants';
import { LeadRecoveryScheduler } from './lead-recovery.scheduler';
import type { LeadRecoveryStep } from './types/lead-recovery-step.type';

const HOUR_MS = 3_600_000;
const NOW = new Date('2026-11-20T12:00:00.000Z');

const buildStep = (id: string, offsetHours: number, enabled = true): LeadRecoveryStep => ({
  id,
  label: id,
  offsetHours,
  enabled,
  template: { name: 't', language: 'es', bodyText: 'Hola', bindings: [] },
  sentCount: 0,
  repliedCount: 0,
});

const buildScheduler = (steps: readonly LeadRecoveryStep[]) => {
  const mockQueue = { add: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(1) };
  const mockSequenceService = { executeGet: jest.fn().mockResolvedValue({ steps }) };
  const scheduler = new LeadRecoveryScheduler(mockQueue as never, mockSequenceService as never);
  return { scheduler, mockQueue };
};

describe('LeadRecoveryScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules the first enabled unsent step by offset, delayed from the anchor', async () => {
    const { scheduler, mockQueue } = buildScheduler([buildStep('late', 24), buildStep('early', 2), buildStep('off', 1, false)]);
    const inputAnchorAt = new Date(NOW.getTime() - HOUR_MS).toISOString();
    await scheduler.executeScheduleNext({ sessionId: 's1', anchorAt: inputAnchorAt, sentStepIds: [] });
    expect(mockQueue.remove).toHaveBeenCalledWith('recovery-s1');
    expect(mockQueue.add).toHaveBeenCalledWith(
      LEAD_AGENT_RECOVERY_JOB,
      { sessionId: 's1', stepId: 'early', anchorAt: inputAnchorAt },
      { jobId: 'recovery-s1', delay: HOUR_MS, removeOnComplete: true, removeOnFail: true },
    );
  });

  it('skips sent steps and picks the next one', async () => {
    const { scheduler, mockQueue } = buildScheduler([buildStep('a', 2), buildStep('b', 24)]);
    await scheduler.executeScheduleNext({ sessionId: 's1', anchorAt: NOW.toISOString(), sentStepIds: ['a'] });
    expect(mockQueue.add.mock.calls[0][1].stepId).toBe('b');
    expect(mockQueue.add.mock.calls[0][2].delay).toBe(24 * HOUR_MS);
  });

  it('uses a zero delay when the step is already overdue', async () => {
    const { scheduler, mockQueue } = buildScheduler([buildStep('a', 2)]);
    const inputAnchorAt = new Date(NOW.getTime() - 10 * HOUR_MS).toISOString();
    await scheduler.executeScheduleNext({ sessionId: 's1', anchorAt: inputAnchorAt, sentStepIds: [] });
    expect(mockQueue.add.mock.calls[0][2].delay).toBe(0);
  });

  it('schedules the closing job after RECOVERY_CLOSE_AFTER_HOURS when every step was sent', async () => {
    const { scheduler, mockQueue } = buildScheduler([buildStep('a', 2), buildStep('b', 24)]);
    const inputAnchorAt = new Date(NOW.getTime() - 100 * HOUR_MS).toISOString();
    await scheduler.executeScheduleNext({ sessionId: 's1', anchorAt: inputAnchorAt, sentStepIds: ['a', 'b'] });
    expect(mockQueue.add).toHaveBeenCalledWith(
      LEAD_AGENT_RECOVERY_JOB,
      { sessionId: 's1', stepId: null, anchorAt: inputAnchorAt },
      { jobId: 'recovery-s1', delay: RECOVERY_CLOSE_AFTER_HOURS * HOUR_MS, removeOnComplete: true, removeOnFail: true },
    );
  });

  it('schedules nothing with an empty sequence but still clears the previous job', async () => {
    const { scheduler, mockQueue } = buildScheduler([]);
    await scheduler.executeScheduleNext({ sessionId: 's1', anchorAt: NOW.toISOString(), sentStepIds: [] });
    expect(mockQueue.remove).toHaveBeenCalledWith('recovery-s1');
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('executeCancel swallows queue errors', async () => {
    const { scheduler, mockQueue } = buildScheduler([]);
    mockQueue.remove.mockRejectedValue(new Error('job is locked'));
    await expect(scheduler.executeCancel('s1')).resolves.toBeUndefined();
  });
});
