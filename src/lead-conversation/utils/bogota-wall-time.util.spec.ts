import { BadRequestException } from '@nestjs/common';
import {
  convertWallAsZCallToTrueUtc,
  isBogotaSunday,
  parseBogotaWallToUtc,
} from './bogota-wall-time.util';

describe('bogota-wall-time.util', () => {
  it('parseBogotaWallToUtc maps 09:30 Bogota to 14:30Z', () => {
    const actual = parseBogotaWallToUtc('2026-10-15', '09:30');
    expect(actual.toISOString()).toBe('2026-10-15T14:30:00.000Z');
  });

  it('parseBogotaWallToUtc throws on invalid date parts', () => {
    expect(() => parseBogotaWallToUtc('not-a-date', '09:30')).toThrow(
      BadRequestException,
    );
  });

  it('convertWallAsZCallToTrueUtc shifts legacy wall-as-Z call by +5h', () => {
    const wallAsZ = new Date('2026-10-15T09:30:00.000Z');
    const actual = convertWallAsZCallToTrueUtc(wallAsZ);
    expect(actual.toISOString()).toBe('2026-10-15T14:30:00.000Z');
  });

  it('isBogotaSunday detects Sunday in Bogota', () => {
    // Sunday 2026-10-18 00:00 Bogota = 05:00Z
    expect(isBogotaSunday(new Date('2026-10-18T05:00:00.000Z'))).toBe(true);
    expect(isBogotaSunday(new Date('2026-10-15T14:30:00.000Z'))).toBe(false);
  });
});
