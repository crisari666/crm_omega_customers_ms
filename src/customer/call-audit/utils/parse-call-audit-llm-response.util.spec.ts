import { CALL_AUDIT_LLM_CONFIG } from '../config/call-audit-llm.config';
import { parseCallAuditLlmResponse } from './parse-call-audit-llm-response.util';

describe('parseCallAuditLlmResponse', () => {
  it('parses valid LLM JSON', () => {
    const raw = JSON.stringify({
      speakerTurns: [
        { role: 'agent', text: 'Buenas tardes' },
        { role: 'customer', text: 'Hola' },
      ],
      indicators: [
        { key: 'apertura', passed: true, rationale: 'ok', evidence: 'Buenas' },
        { key: 'storytelling', passed: false, rationale: 'no', evidence: '' },
        { key: 'escucha_activa', passed: true, rationale: 'ok', evidence: 'Hola' },
        { key: 'cierre', passed: false, rationale: 'no', evidence: '' },
      ],
      interestScore: 4,
      interestScoreRationale: 'Interés medio-alto',
    });
    const result = parseCallAuditLlmResponse(raw, CALL_AUDIT_LLM_CONFIG);
    expect(result.speakerTurns).toHaveLength(2);
    expect(result.indicators).toHaveLength(4);
    expect(result.interestScore).toBe(4);
  });

  it('accepts missing speakerTurns when rubric is complete', () => {
    const raw = JSON.stringify({
      indicators: [
        { key: 'apertura', passed: true, rationale: 'ok', evidence: 'Buenas' },
        { key: 'storytelling', passed: false, rationale: 'no', evidence: '' },
        { key: 'escucha_activa', passed: true, rationale: 'ok', evidence: 'Hola' },
        { key: 'cierre', passed: false, rationale: 'no', evidence: '' },
      ],
      interestScore: 3,
      interestScoreRationale: 'Interés medio',
    });
    const result = parseCallAuditLlmResponse(raw, CALL_AUDIT_LLM_CONFIG);
    expect(result.speakerTurns).toBeUndefined();
    expect(result.indicators).toHaveLength(4);
  });

  it('throws when indicator key is missing', () => {
    const raw = JSON.stringify({
      speakerTurns: [{ role: 'agent', text: 'Hola' }],
      indicators: [{ key: 'apertura', passed: true }],
      interestScore: 3,
    });
    expect(() => parseCallAuditLlmResponse(raw, CALL_AUDIT_LLM_CONFIG)).toThrow(
      'Missing indicator key',
    );
  });
});
