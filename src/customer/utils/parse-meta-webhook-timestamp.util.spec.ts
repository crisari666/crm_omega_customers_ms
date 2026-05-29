import { parseMetaWebhookTimestampToDate } from './parse-meta-webhook-timestamp.util';

describe('parseMetaWebhookTimestampToDate', () => {
  it('parses Meta status timestamp as Unix seconds string', () => {
    const actual = parseMetaWebhookTimestampToDate('1780072260');
    expect(Number.isNaN(actual.getTime())).toBe(false);
    expect(actual.getUTCFullYear()).toBeGreaterThanOrEqual(2025);
  });
  it('parses numeric seconds', () => {
    const actual = parseMetaWebhookTimestampToDate(1780072260);
    expect(actual.getTime()).toBe(1780072260 * 1000);
  });
  it('parses ISO strings', () => {
    const actual = parseMetaWebhookTimestampToDate('2026-05-29T12:00:00.000Z');
    expect(actual.toISOString()).toBe('2026-05-29T12:00:00.000Z');
  });
  it('returns now for empty input', () => {
    const before = Date.now();
    const actual = parseMetaWebhookTimestampToDate('');
    const after = Date.now();
    expect(actual.getTime()).toBeGreaterThanOrEqual(before);
    expect(actual.getTime()).toBeLessThanOrEqual(after);
  });
});
