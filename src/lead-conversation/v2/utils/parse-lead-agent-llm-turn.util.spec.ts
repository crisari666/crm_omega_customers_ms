import { parseLeadAgentLlmTurn } from './parse-lead-agent-llm-turn.util';

const validation = { allowedProjectIds: new Set(['p1']), allowedFaqIds: new Set(['f1', 'f2']) };

const parse = (payload: unknown) => parseLeadAgentLlmTurn(JSON.stringify(payload), validation);

describe('parseLeadAgentLlmTurn', () => {
  it('returns null for invalid JSON, non-objects and answers without replies', () => {
    expect(parseLeadAgentLlmTurn('not json', validation)).toBeNull();
    expect(parseLeadAgentLlmTurn('[]', validation)).toBeNull();
    expect(parse({ replies: [] })).toBeNull();
    expect(parse({ replies: ['   ', ''] })).toBeNull();
    expect(parse({})).toBeNull();
  });

  it('trims replies, cuts them to 600 characters and keeps at most three', () => {
    const actualTurn = parse({ replies: ['  hola  ', 'a'.repeat(700), '', 'tres', 'cuatro'] });
    expect(actualTurn?.replies).toHaveLength(3);
    expect(actualTurn?.replies[0]).toBe('hola');
    expect(actualTurn?.replies[1]).toHaveLength(600);
  });

  it('drops unknown enum values and applies the defaults', () => {
    const actualTurn = parse({
      replies: ['hola'],
      profile: { motivation: 'invest', paymentMethod: 'bitcoin', timeline: 'later', budget: ' 80M ', bogus: 1 },
      intents: ['asked_price', 'flirting', 'asked_price'],
      action: 'explode',
      media: ['video', 'hologram'],
      callPeriod: 'midnight',
    });
    expect(actualTurn).toMatchObject({
      profile: { motivation: 'invest', timeline: 'later', budget: '80M' },
      intents: ['asked_price'],
      action: 'continue',
      media: ['video'],
      callPeriod: null,
    });
    expect(actualTurn?.profile).not.toHaveProperty('paymentMethod');
    expect(actualTurn?.profile).not.toHaveProperty('bogus');
  });

  it('keeps projectId and usedFaqIds only when they were in the prompt', () => {
    const actualTurn = parse({ replies: ['hola'], projectId: 'p1', usedFaqIds: ['f1', 'ghost', 'f1'] });
    expect(actualTurn).toMatchObject({ projectId: 'p1', usedFaqIds: ['f1'] });
    expect(parse({ replies: ['hola'], projectId: 'ghost' })?.projectId).toBeNull();
  });

  it('accepts offer_projects as a valid action', () => {
    expect(parse({ replies: ['¿Cuál te interesa?'], action: 'offer_projects' })?.action).toBe('offer_projects');
  });

  it('keeps the unanswered question trimmed or null', () => {
    expect(parse({ replies: ['hola'], unansweredQuestion: ' ¿Hay piscina? ' })?.unansweredQuestion).toBe('¿Hay piscina?');
    expect(parse({ replies: ['hola'], unansweredQuestion: '  ' })?.unansweredQuestion).toBeNull();
  });
});
