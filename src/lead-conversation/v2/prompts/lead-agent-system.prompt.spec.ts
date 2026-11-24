import { buildLeadAgentSystemPrompt } from './lead-agent-system.prompt';

describe('buildLeadAgentSystemPrompt', () => {
  const prompt = buildLeadAgentSystemPrompt({ assistantName: 'Verónica', businessName: 'La Ceiba' });

  it('keeps FAQ answers on continue unless the customer asks for a call', () => {
    expect(prompt).toContain('usedFaqIds');
    expect(prompt).toContain('action "continue"');
    expect(prompt).toContain('wants_call');
    expect(prompt).toContain('elige de la lista de horarios');
  });

  it('asks for a warm tone without pushy schedule closers', () => {
    expect(prompt).toContain('sin presión');
    expect(prompt).toContain('solo elige una opción');
  });
});
