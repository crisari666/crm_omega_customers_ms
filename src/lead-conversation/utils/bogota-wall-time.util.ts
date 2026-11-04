import { BadRequestException } from '@nestjs/common';
import { BOGOTA_UTC_OFFSET_HOURS } from '../constants/lead-call-slots.constants';

const HOUR_MS = 60 * 60 * 1000;
const SUNDAY = 0;

/**
 * Bogota wall `YYYY-MM-DD` + `HH:mm` → true UTC instant (UTC−5, no DST).
 * Used for `call` schedule events (manual create + lead AI).
 */
export function parseBogotaWallToUtc(dateYmd: string, timeHm: string): Date {
  const [year, month, day] = dateYmd.split('-').map((part) => Number.parseInt(part, 10));
  const [hour, minute] = timeHm.split(':').map((part) => Number.parseInt(part, 10));
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) {
    throw new BadRequestException('Fecha u hora inválida');
  }
  const localMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  return new Date(localMs - BOGOTA_UTC_OFFSET_HOURS * HOUR_MS);
}

/**
 * Treat a wall-as-Z Date (UTC getters = intended Bogota wall) as Bogota wall → true UTC.
 * Used when migrating legacy manual `call` rows.
 */
export function convertWallAsZCallToTrueUtc(wallAsZ: Date): Date {
  const dateYmd = [
    wallAsZ.getUTCFullYear(),
    String(wallAsZ.getUTCMonth() + 1).padStart(2, '0'),
    String(wallAsZ.getUTCDate()).padStart(2, '0'),
  ].join('-');
  const timeHm = [
    String(wallAsZ.getUTCHours()).padStart(2, '0'),
    String(wallAsZ.getUTCMinutes()).padStart(2, '0'),
  ].join(':');
  return parseBogotaWallToUtc(dateYmd, timeHm);
}

/** Whether the instant falls on Sunday in America/Bogota. */
export function isBogotaSunday(instant: Date): boolean {
  const local = new Date(instant.getTime() + BOGOTA_UTC_OFFSET_HOURS * HOUR_MS);
  return local.getUTCDay() === SUNDAY;
}
