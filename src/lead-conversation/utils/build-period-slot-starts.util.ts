import {
  BOGOTA_UTC_OFFSET_HOURS,
  CALL_PERIOD_WINDOWS,
  CALL_SLOT_MINUTES,
  MIN_SLOT_LEAD_MINUTES,
} from '../constants/lead-call-slots.constants';
import type { LeadCallPeriod } from '../types/lead-call-period.type';
import { isCallSlotDayOpen } from './is-call-slot-day-open.util';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type BuildPeriodSlotStartsInput = {
  readonly period: LeadCallPeriod;
  readonly now: Date;
  readonly lookaheadDays: number;
};

/** 30-minute slot starts (UTC instants) of a Bogota-local period over the lookahead days, skipping slots too close to `now`. */
export function buildPeriodSlotStarts({ period, now, lookaheadDays }: BuildPeriodSlotStartsInput): Date[] {
  const { startHour, endHour } = CALL_PERIOD_WINDOWS[period];
  const localNow = new Date(now.getTime() + BOGOTA_UTC_OFFSET_HOURS * HOUR_MS);
  const earliest = now.getTime() + MIN_SLOT_LEAD_MINUTES * MINUTE_MS;
  const starts: Date[] = [];
  for (let day = 0; day < lookaheadDays; day += 1) {
    for (let minutes = startHour * 60; minutes < endHour * 60; minutes += CALL_SLOT_MINUTES) {
      const localMs = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + day, 0, minutes);
      const start = new Date(localMs - BOGOTA_UTC_OFFSET_HOURS * HOUR_MS);
      if (start.getTime() >= earliest && isCallSlotDayOpen(start, now)) starts.push(start);
    }
  }
  return starts;
}
