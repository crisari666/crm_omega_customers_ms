export type TimedUtteranceInput = {
  readonly speaker?: string;
  readonly text?: string;
  readonly start?: number;
  readonly end?: number;
};

/**
 * Formats utterance timestamps as [mm:ss] relative to the first timed utterance.
 */
export function formatUtteranceClock(
  startMs: number | undefined,
  originMs = 0,
): string {
  if (startMs === undefined || !Number.isFinite(startMs) || startMs < 0) {
    return '';
  }
  const relative = Math.max(0, startMs - originMs);
  const totalSeconds = Math.floor(relative / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Builds a timed, speaker-labeled transcript from Meet/VOIP utterances.
 */
export function formatTimedTranscriptFromUtterances(
  utterances: ReadonlyArray<TimedUtteranceInput>,
): string {
  const firstStart = utterances.find(
    (u) => typeof u.start === 'number' && Number.isFinite(u.start),
  )?.start;
  const originMs = typeof firstStart === 'number' ? firstStart : 0;
  const lines: string[] = [];
  for (const utterance of utterances) {
    const text = utterance.text?.trim() ?? '';
    if (text === '') {
      continue;
    }
    const clock = formatUtteranceClock(utterance.start, originMs);
    const speaker = utterance.speaker?.trim() || 'Speaker';
    if (clock !== '') {
      lines.push(`[${clock}] ${speaker}: ${text}`);
    } else {
      lines.push(`${speaker}: ${text}`);
    }
  }
  return lines.join('\n');
}
