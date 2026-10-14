import { REPLY_ID } from './lead-conversation.constants';

/**
 * Free-text keywords (already normalized) that map to an interactive reply id
 * when the customer types instead of tapping a button.
 */
export const REPLY_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  [REPLY_ID.allProjects]: ['todos', 'todo', 'cualquiera', 'varios'],
  [REPLY_ID.paymentFinanced]: ['financ', 'credito', 'cuota', 'plazo'],
  [REPLY_ID.paymentCash]: ['contado', 'efectivo', 'de una'],
  [REPLY_ID.slotMorning]: ['manana', 'temprano', 'am'],
  [REPLY_ID.slotAfternoon]: ['tarde', 'pm'],
  [REPLY_ID.slotNight]: ['noche'],
  [REPLY_ID.reminderYes]: ['si', 'claro', 'dale', 'ok', 'listo', 'bueno', 'de acuerdo'],
  [REPLY_ID.reminderNo]: ['no', 'no gracias', 'ya no', 'no me interesa'],
} as const;
