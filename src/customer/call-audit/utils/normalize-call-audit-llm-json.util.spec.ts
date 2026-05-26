import { normalizeCallAuditLlmJsonContent } from './normalize-call-audit-llm-json.util';

describe('normalizeCallAuditLlmJsonContent', () => {
  it('returns trimmed plain JSON unchanged', () => {
    const input = '{"interestScore":3}';
    expect(normalizeCallAuditLlmJsonContent(input)).toBe(input);
  });

  it('strips markdown json fences', () => {
    const input = '```json\n{"interestScore":3}\n```';
    expect(normalizeCallAuditLlmJsonContent(input)).toBe('{"interestScore":3}');
  });
});
