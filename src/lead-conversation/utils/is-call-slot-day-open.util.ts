import { BOGOTA_UTC_OFFSET_HOURS, CALL_PERIOD_WINDOWS } from '../constants/lead-call-slots.constants';
import { findCallPeriod } from './find-call-period.util';

const HOUR_MS = 60 * 60 * 1000;
const SUNDAY = 0;
/** Night window ends at 21:00 Bogota; nothing the same day is offered after that. */
const SAME_DAY_CUTOFF_HOUR = CALL_PERIOD_WINDOWS.night.endHour;

const toBogotaWallClock = (date: Date): Date => new Date(date.getTime() + BOGOTA_UTC_OFFSET_HOURS * HOUR_MS);

const isSameBogotaDay = (left: Date, right: Date): boolean =>
  left.getUTCFullYear() === right.getUTCFullYear() &&
  left.getUTCMonth() === right.getUTCMonth() &&
  left.getUTCDate() === right.getUTCDate();

/**
 * Sunday is closed. A same-day slot is closed once Bogota time is past that
 * period's window, or at/after 21:00 for every period.
 */
export function isCallSlotDayOpen(slotStart: Date, now: Date): boolean {
  const slotLocal = toBogotaWallClock(slotStart);
  if (slotLocal.getUTCDay() === SUNDAY) return false;
  const nowLocal = toBogotaWallClock(now);
  if (!isSameBogotaDay(slotLocal, nowLocal)) return true;
  const hour = nowLocal.getUTCHours();
  if (hour >= SAME_DAY_CUTOFF_HOUR) return false;
  const period = findCallPeriod(slotStart);
  if (period === undefined) return false;
  return hour < CALL_PERIOD_WINDOWS[period].endHour;
}
