import {
  CALL_AUDIT_SPEAKER_AGENT,
  CALL_AUDIT_SPEAKER_CUSTOMER,
} from '../constants/call-audit.constant';
import type { CallAuditSpeakerTurn } from '../types/customer-call-audit.type';
import type { TimedUtteranceInput } from './format-timed-transcript.util';

function resolveSpeakerRole(speaker: string | undefined): CallAuditSpeakerTurn['role'] {
  const raw = (speaker ?? '').toLowerCase();
  if (
    raw.includes('agent') ||
    raw.includes('asesor') ||
    raw.includes('ventor') ||
    raw.includes('organizer')
  ) {
    return CALL_AUDIT_SPEAKER_AGENT;
  }
  if (
    raw.includes('customer') ||
    raw.includes('cliente') ||
    raw.includes('prospect')
  ) {
    return CALL_AUDIT_SPEAKER_CUSTOMER;
  }
  return CALL_AUDIT_SPEAKER_CUSTOMER;
}

/**
 * Maps stored call-log utterances into timed speakerTurns for audit persistence/UI.
 */
export function mapUtterancesToSpeakerTurns(
  utterances: ReadonlyArray<TimedUtteranceInput>,
): CallAuditSpeakerTurn[] {
  const turns: CallAuditSpeakerTurn[] = [];
  for (const utterance of utterances) {
    const text = utterance.text?.trim() ?? '';
    if (text === '') {
      continue;
    }
    const speakerLabel = utterance.speaker?.trim() || undefined;
    turns.push({
      role: resolveSpeakerRole(speakerLabel),
      text,
      startMs:
        typeof utterance.start === 'number' && Number.isFinite(utterance.start)
          ? utterance.start
          : undefined,
      endMs:
        typeof utterance.end === 'number' && Number.isFinite(utterance.end)
          ? utterance.end
          : undefined,
      speakerLabel,
    });
  }
  return turns;
}
