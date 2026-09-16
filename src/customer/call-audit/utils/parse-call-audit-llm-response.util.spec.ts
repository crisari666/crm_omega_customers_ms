import { CALL_AUDIT_LLM_CONFIG } from '../config/call-audit-llm.config';
import { parseCallAuditLlmResponse } from './parse-call-audit-llm-response.util';

function buildIndicatorsPayload(
  passedKeys: string[] = [],
): Array<{ key: string; passed: boolean; rationale: string; evidence: string }> {
  return CALL_AUDIT_LLM_CONFIG.indicators.map((indicator) => ({
    key: indicator.key,
    passed: passedKeys.includes(indicator.key),
    rationale: 'ok',
    evidence: 'ev',
  }));
}

describe('parseCallAuditLlmResponse', () => {
  it('parses valid LLM JSON', () => {
    const raw = JSON.stringify({
      speakerTurns: [
        { role: 'agent', text: 'Buenas tardes' },
        { role: 'customer', text: 'Hola' },
      ],
      indicators: buildIndicatorsPayload(['saludo', 'cierre']),
      interestScore: 4,
      interestScoreRationale: 'Interés medio-alto',
    });
    const result = parseCallAuditLlmResponse(raw, CALL_AUDIT_LLM_CONFIG);
    expect(result.speakerTurns).toHaveLength(2);
    expect(result.indicators).toHaveLength(8);
    expect(result.interestScore).toBe(4);
  });

  it('accepts missing speakerTurns when rubric is complete', () => {
    const raw = JSON.stringify({
      indicators: buildIndicatorsPayload(['descubrimiento']),
      interestScore: 3,
      interestScoreRationale: 'Interés medio',
    });
    const result = parseCallAuditLlmResponse(raw, CALL_AUDIT_LLM_CONFIG);
    expect(result.speakerTurns).toBeUndefined();
    expect(result.indicators).toHaveLength(8);
  });

  it('throws when indicator key is missing', () => {
    const raw = JSON.stringify({
      speakerTurns: [{ role: 'agent', text: 'Hola' }],
      indicators: [{ key: 'saludo', passed: true }],
      interestScore: 3,
    });
    expect(() => parseCallAuditLlmResponse(raw, CALL_AUDIT_LLM_CONFIG)).toThrow(
      'Missing indicator key',
    );
  });
});
