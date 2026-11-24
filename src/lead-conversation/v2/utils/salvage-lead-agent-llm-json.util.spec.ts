import { salvageLeadAgentLlmJson } from './salvage-lead-agent-llm-json.util';

describe('salvageLeadAgentLlmJson', () => {
  it('returns null for empty or non-object text', () => {
    expect(salvageLeadAgentLlmJson('')).toBeNull();
    expect(salvageLeadAgentLlmJson('   ')).toBeNull();
    expect(salvageLeadAgentLlmJson('no braces here')).toBeNull();
  });

  it('strips markdown fences and keeps the JSON object', () => {
    const actual = salvageLeadAgentLlmJson('```json\n{"replies":["Hola"]}\n```');
    expect(actual).toBe('{"replies":["Hola"]}');
  });

  it('slices from the first brace to the last when prose surrounds the object', () => {
    const actual = salvageLeadAgentLlmJson('Sure.\n{"replies":["Ok"],"action":"continue"}\nThanks');
    expect(actual).toBe('{"replies":["Ok"],"action":"continue"}');
  });
});
