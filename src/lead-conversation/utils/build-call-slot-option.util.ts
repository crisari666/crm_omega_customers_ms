import { CALL_SLOT_REPLY_PREFIX } from '../constants/lead-call-slots.constants';
import type { LeadCallSlot } from '../types/lead-call-slot.type';
import type { OutboundOption } from '../types/outbound-message-plan.type';
import { formatCallSlotDate } from './format-call-slot-date.util';

/** WhatsApp list row of a free call slot: id `callslot:<ISO>`, title "mié 15 oct · 9:00 a. m.". */
export function buildCallSlotOption(slot: LeadCallSlot): OutboundOption {
  return { id: `${CALL_SLOT_REPLY_PREFIX}${slot.start.toISOString()}`, title: formatCallSlotDate(slot.start) };
}
