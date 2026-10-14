import { CALL_SLOT_REPLY_PREFIX } from '../constants/lead-call-slots.constants';

/** Slot start encoded in a `callslot:<ISO>` reply id; undefined for any other id. */
export function parseCallSlotReplyId(replyId: string): Date | undefined {
  if (!replyId.startsWith(CALL_SLOT_REPLY_PREFIX)) return undefined;
  const start = new Date(replyId.slice(CALL_SLOT_REPLY_PREFIX.length));
  return Number.isNaN(start.getTime()) ? undefined : start;
}
