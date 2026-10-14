import { BOGOTA_TIME_ZONE } from '../constants/lead-call-slots.constants';

const SHORT_FORMAT = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const LONG_FORMAT = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const pick = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string =>
  parts.find((part) => part.type === type)?.value ?? '';

const stripDot = (value: string): string => value.replace(/\.$/, '');

function formatTime(parts: Intl.DateTimeFormatPart[]): string {
  return `${pick(parts, 'hour')}:${pick(parts, 'minute')} ${pick(parts, 'dayPeriod')}`.replace(/\s+/g, ' ').trim();
}

/**
 * Bogota-local slot label. `short` fits a WhatsApp list row title (≤24 chars): "mié 15 oct · 9:00 a. m.".
 * `long` is for the confirmation: "miércoles 15 de octubre, 9:00 a. m.".
 */
export function formatCallSlotDate(date: Date, variant: 'short' | 'long' = 'short'): string {
  if (variant === 'long') {
    const parts = LONG_FORMAT.formatToParts(date);
    return `${pick(parts, 'weekday')} ${pick(parts, 'day')} de ${pick(parts, 'month')}, ${formatTime(parts)}`;
  }
  const parts = SHORT_FORMAT.formatToParts(date);
  return `${stripDot(pick(parts, 'weekday'))} ${pick(parts, 'day')} ${stripDot(pick(parts, 'month'))} · ${formatTime(parts)}`;
}
