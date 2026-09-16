export type ParsedMeetDriveUtterance = {
  readonly speaker?: string;
  readonly text: string;
  readonly start?: number;
  readonly end?: number;
};

const TIMESTAMP_LINE =
  /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/;
const SPEAKER_WITH_TIME =
  /^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;

/**
 * Parses mm:ss or h:mm:ss clock into milliseconds from meeting start.
 */
export function parseMeetClockToMs(clock: string): number | undefined {
  const trimmed = clock.trim();
  const match = TIMESTAMP_LINE.exec(trimmed);
  if (match === null) {
    return undefined;
  }
  const hours = match[1] !== undefined ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds)
  ) {
    return undefined;
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

/**
 * Parses Google Meet Drive Doc plain-text export into timed utterances.
 * Typical pattern: speaker name, timestamp line, then one or more text lines.
 */
export function parseMeetDriveTranscriptDocument(
  rawText: string,
): ParsedMeetDriveUtterance[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const utterances: ParsedMeetDriveUtterance[] = [];
  let speaker: string | undefined;
  let startMs: number | undefined;
  let buffer: string[] = [];
  const flush = (): void => {
    const text = buffer.join(' ').trim();
    buffer = [];
    if (text === '') {
      return;
    }
    utterances.push({
      speaker,
      text,
      start: startMs,
    });
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = i + 1 < lines.length ? lines[i + 1] : undefined;
    const combined = SPEAKER_WITH_TIME.exec(line);
    if (combined !== null) {
      flush();
      speaker = combined[1].trim();
      startMs = parseMeetClockToMs(combined[2]);
      continue;
    }
    const clockOnly = parseMeetClockToMs(line);
    if (clockOnly !== undefined) {
      startMs = clockOnly;
      continue;
    }
    if (next !== undefined && parseMeetClockToMs(next) !== undefined) {
      flush();
      speaker = line;
      startMs = undefined;
      continue;
    }
    buffer.push(line);
  }
  flush();
  return utterances;
}
