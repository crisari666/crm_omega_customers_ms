/**
 * Extracts a Google Meet meeting code from a Meet join URL.
 * Example: https://meet.google.com/abc-defg-hij → abc-defg-hij
 */
export function extractGoogleMeetingCode(meetUrl: string): string | undefined {
  const trimmed = meetUrl.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    if (!url.hostname.includes('meet.google.com')) {
      return undefined;
    }
    const segment = url.pathname
      .split('/')
      .map((p) => p.trim())
      .find((p) => p.length > 0);
    if (!segment) {
      return undefined;
    }
    const code = segment.toLowerCase();
    if (!/^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/.test(code)) {
      return code.length > 0 ? code : undefined;
    }
    return code;
  } catch {
    return undefined;
  }
}

export function buildGoogleMeetCallSid(args: {
  readonly googleCalendarEventId?: string;
  readonly scheduleEventId: string;
}): string {
  const calendarId = args.googleCalendarEventId?.trim();
  if (calendarId) {
    return `gmeet:${calendarId}`;
  }
  return `gmeet:schedule:${args.scheduleEventId}`;
}
