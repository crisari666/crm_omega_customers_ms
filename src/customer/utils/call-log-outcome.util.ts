import type { CustomerCallEvent } from '../schemas/customer-call-log.schema';

export type ResolvedCallOutcome =
  | 'answered'
  | 'busy'
  | 'no_answer'
  | 'failed'
  | 'canceled'
  | 'ringing'
  | 'in_progress'
  | 'unknown';

type EventLike = Pick<CustomerCallEvent, 'eventType' | 'timestamp' | 'status'>;

function toTime(t: Date | string): number {
  return new Date(t).getTime();
}

function mapTwilioStatusString(status?: string): ResolvedCallOutcome {
  if (!status) {
    return 'unknown';
  }
  const s = status.toLowerCase();
  if (s.includes('busy')) {
    return 'busy';
  }
  if (s.includes('no-answer') || s.includes('no_answer')) {
    return 'no_answer';
  }
  if (s.includes('failed')) {
    return 'failed';
  }
  if (s.includes('canceled') || s.includes('cancelled')) {
    return 'canceled';
  }
  if (s.includes('completed') || s === 'answered') {
    return 'answered';
  }
  if (s.includes('ringing')) {
    return 'ringing';
  }
  if (s.includes('in-progress') || s.includes('queued') || s.includes('init')) {
    return 'in_progress';
  }
  return 'unknown';
}

function eventTypeToOutcome(
  type: string | undefined,
  fallbackStatus?: string,
): ResolvedCallOutcome {
  if (!type || type === 'transcription-updated') {
    return mapTwilioStatusString(fallbackStatus);
  }
  switch (type) {
    case 'answered':
      return 'answered';
    case 'busy':
      return 'busy';
    case 'no-answer':
      return 'no_answer';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    case 'ringing':
      return 'ringing';
    case 'initiated':
    case 'created':
      return 'in_progress';
    case 'completed':
      return mapTwilioStatusString(fallbackStatus);
    default:
      return 'unknown';
  }
}

/**
 * Twilio sends a terminal `completed` event; UI should show the last *non-completed*
 * signal (answered / busy / no-answer / ringing / …) as the human-visible outcome.
 */
export function deriveResolvedCallOutcome(
  events: EventLike[] | undefined,
  headerStatus?: string,
): {
  outcome: ResolvedCallOutcome;
  preCompleteEventType?: string;
  completedAtIso?: string;
} {
  if (!events?.length) {
    return { outcome: mapTwilioStatusString(headerStatus) };
  }
  const sorted = [...events].sort((a, b) => toTime(a.timestamp) - toTime(b.timestamp));
  let lastCompleteIndex = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].eventType === 'completed') {
      lastCompleteIndex = i;
    }
  }
  const completedAtIso =
    lastCompleteIndex >= 0
      ? new Date(sorted[lastCompleteIndex].timestamp).toISOString()
      : undefined;

  if (lastCompleteIndex === -1) {
    const tail = sorted[sorted.length - 1];
    return {
      outcome: eventTypeToOutcome(tail.eventType, tail.status ?? headerStatus),
      completedAtIso,
    };
  }
  if (lastCompleteIndex === 0) {
    return {
      outcome: mapTwilioStatusString(headerStatus),
      completedAtIso,
    };
  }
  const before = sorted[lastCompleteIndex - 1];
  return {
    outcome: eventTypeToOutcome(before.eventType, before.status ?? headerStatus),
    preCompleteEventType: before.eventType,
    completedAtIso,
  };
}

export function callOutcomeMatchesFilter(
  outcome: ResolvedCallOutcome,
  filter: 'all' | 'answered' | 'busy' | 'no_answer',
): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'answered') {
    return outcome === 'answered';
  }
  if (filter === 'busy') {
    return outcome === 'busy';
  }
  /** "Sin contestar" — missed or failed to connect */
  return (
    outcome === 'no_answer' ||
    outcome === 'failed' ||
    outcome === 'canceled' ||
    outcome === 'ringing' ||
    outcome === 'unknown' ||
    outcome === 'in_progress'
  );
}
