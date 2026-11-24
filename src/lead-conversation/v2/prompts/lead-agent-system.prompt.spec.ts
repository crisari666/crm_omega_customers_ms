import { buildLeadAgentSystemPrompt } from './lead-agent-system.prompt';

describe('buildLeadAgentSystemPrompt', () => {
  const prompt = buildLeadAgentSystemPrompt({ assistantName: 'Verónica', businessName: 'La Ceiba' });

  it('keeps FAQ answers on continue unless the customer asks for a call', () => {
    expect(prompt).toContain('usedFaqIds');
    expect(prompt).toContain('action "continue"');
    expect(prompt).toContain('wants_call');
    expect(prompt).toContain('botones de siguiente paso');
  });

  it('asks for a warm tone without pushy schedule closers', () => {
    expect(prompt).toContain('sin presión');
    expect(prompt).toContain('elige una opción');
  });

  it('frames the goal as a professional lot-buying process closing in the advisor call', () => {
    expect(prompt).toContain('orientación profesional de compra de lote');
    expect(prompt).toContain('camino guiado cierra de forma natural');
    expect(prompt).toContain('interrogatorio');
    expect(prompt).toContain('Una sola pregunta por turno');
    expect(prompt).toContain('captureKnown');
    expect(prompt).toContain('nextCaptureField');
    expect(prompt).toContain('systemSendsFinancing');
  });

  it('forbids writing the project question when needsProject and mirrors motivation / capture buttons', () => {
    expect(prompt).toContain('Si needsProject es true y NO hay suggestedProject');
    expect(prompt).toContain('Si needsMotivation es true, el sistema enviará ÚNICAMENTE los botones');
    expect(prompt).toContain('NUNCA inventes ni asumas motivation');
    expect(prompt).toContain('NO asumas que ya eligió ese proyecto');
    expect(prompt).toContain('No pongas su id en projectId solo porque está en el anuncio');
    expect(prompt).toContain('needsTimeToBuy');
    expect(prompt).toContain('ÚNICAMENTE los botones Financiado / De contado');
    expect(prompt).toContain('systemSendsGreeting');
    expect(prompt).toContain('selector de lotes con cuotas mensuales');
    expect(prompt).toContain('abre la agenda de llamada');
  });

  it('puts a JSON-only contract at the start and end with a parseable EXAMPLE shape', () => {
    expect(prompt.startsWith('REGLA CRÍTICA DE FORMATO')).toBe(true);
    expect(prompt).toContain('Nunca respondas con texto plano');
    expect(prompt).toContain('JSON.parse()');
    expect(prompt).toContain('CONTRATO DE RESPUESTA');
    expect(prompt).toContain('EXAMPLE JSON OUTPUT');
    expect(prompt).toContain('"continue" | "send_media" | "offer_projects" | "offer_call_slots" | "opt_out"');
    expect(prompt).toContain('cómo va tu día');
    const exampleMatch = prompt.match(/\{"replies":\[.*?\],"unansweredQuestion":null\}/);
    expect(exampleMatch).not.toBeNull();
    expect(() => JSON.parse(exampleMatch![0])).not.toThrow();
  });
});
