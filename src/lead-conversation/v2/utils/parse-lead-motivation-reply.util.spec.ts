import { parseLeadMotivationFromPending, parseLeadMotivationReply } from './parse-lead-motivation-reply.util';

describe('parseLeadMotivationReply', () => {
  it.each([
    ['Construir', 'build'],
    ['construi4', 'build'],
    ['como inversión', 'invest'],
    ['quiero invertir', 'invest'],
    ['solo explorando', 'exploring'],
    ['solo mirando', 'exploring'],
    ['vacaciones', 'leisure'],
  ] as const)('maps %s to %s', (inputText, expectedMotivation) => {
    expect(parseLeadMotivationReply(inputText)).toBe(expectedMotivation);
  });

  it('returns undefined for unrelated text', () => {
    expect(parseLeadMotivationReply('Hola')).toBeUndefined();
    expect(parseLeadMotivationReply('Valle del Sol')).toBeUndefined();
  });
});

describe('parseLeadMotivationFromPending', () => {
  it('uses the first matching pending message', () => {
    expect(parseLeadMotivationFromPending(['Hola', 'Construir'])).toBe('build');
  });

  it('returns undefined when nothing matches', () => {
    expect(parseLeadMotivationFromPending(['Hola', 'ok'])).toBeUndefined();
  });
});
