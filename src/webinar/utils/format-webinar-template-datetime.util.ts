/** Same timezone as CRM WhatsApp / ventor assignment (Colombia). */
export const WEBINAR_EVENT_TIMEZONE = 'America/Bogota' as const;

export type WebinarTemplateDateTimeFields = {
  readonly dayLabel: string;
  readonly dateText: string;
  readonly timeText: string;
};

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

/**
 * Builds WhatsApp template vars from an absolute instant in America/Bogota.
 */
export function formatWebinarTemplateDateTime(
  scheduledAt: Date,
  timeZone: string = WEBINAR_EVENT_TIMEZONE,
): WebinarTemplateDateTimeFields {
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error('Invalid scheduledAt for webinar template formatting');
  }
  const dayParts = new Intl.DateTimeFormat('es-CO', {
    timeZone,
    weekday: 'long',
  }).formatToParts(scheduledAt);
  const dateParts = new Intl.DateTimeFormat('es-CO', {
    timeZone,
    day: 'numeric',
    month: 'long',
  }).formatToParts(scheduledAt);
  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(scheduledAt);
  const weekday = capitalizeFirst(readPart(dayParts, 'weekday'));
  const day = readPart(dateParts, 'day');
  const month = capitalizeFirst(readPart(dateParts, 'month'));
  const hour = readPart(timeParts, 'hour');
  const minute = readPart(timeParts, 'minute');
  const dayPeriod = readPart(timeParts, 'dayPeriod').toLowerCase().replace(/\./g, '');
  return {
    dayLabel: weekday,
    dateText: `${day} de ${month}`,
    timeText: `${hour}:${minute}${dayPeriod}`,
  };
}
