import { formatWebinarTemplateDateTime } from './format-webinar-template-datetime.util';

describe('formatWebinarTemplateDateTime', () => {
  it('formats a Bogota wall-clock instant into Spanish template fields', () => {
    // 2026-09-10 19:45 America/Bogota = 2026-09-11 00:45 UTC
    const scheduledAt = new Date('2026-09-11T00:45:00.000Z');
    const actual = formatWebinarTemplateDateTime(scheduledAt);
    expect(actual.dayLabel).toBe('Jueves');
    expect(actual.dateText).toBe('10 de Septiembre');
    expect(actual.timeText).toBe('7:45pm');
  });
});
