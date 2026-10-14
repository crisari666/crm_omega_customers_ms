import { BOGOTA_UTC_OFFSET_HOURS, CALL_PERIOD_WINDOWS, CALL_SLOT_MINUTES } from '../constants/lead-call-slots.constants';
import { LEAD_CALL_PERIODS, type LeadCallPeriod } from '../types/lead-call-period.type';

const HOUR_MS = 60 * 60 * 1000;

/** Period of a valid slot start (aligned to 30 min, inside a window); undefined otherwise. */
export function findCallPeriod(start: Date): LeadCallPeriod | undefined {
  const local = new Date(start.getTime() + BOGOTA_UTC_OFFSET_HOURS * HOUR_MS);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutes % CALL_SLOT_MINUTES !== 0 || local.getUTCSeconds() !== 0 || local.getUTCMilliseconds() !== 0) {
    return undefined;
  }
  return LEAD_CALL_PERIODS.find((period) => {
    const { startHour, endHour } = CALL_PERIOD_WINDOWS[period];
    return minutes >= startHour * 60 && minutes < endHour * 60;
  });
}
