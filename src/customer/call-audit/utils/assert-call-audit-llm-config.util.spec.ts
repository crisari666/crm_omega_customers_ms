import * as fs from 'fs';
import * as path from 'path';
import { assertCallAuditLlmConfig } from './assert-call-audit-llm-config.util';

describe('assertCallAuditLlmConfig', () => {
  it('accepts the committed JSON config file', () => {
    const filePath = path.join(
      process.cwd(),
      'config',
      'call-audit-llm.config.json',
    );
    const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const config = assertCallAuditLlmConfig(raw);
    expect(config.prompts.userTemplate).toContain('{{transcript}}');
    expect(config.indicators).toHaveLength(8);
    const sum = config.indicators.reduce((acc, i) => acc + i.maxPoints, 0);
    expect(sum).toBe(100);
  });

  it('rejects JSON without prompts', () => {
    expect(() =>
      assertCallAuditLlmConfig({
        version: '1',
        model: 'm',
        temperature: 0.1,
        indicators: [{ key: 'a', label: 'A', description: 'd', maxPoints: 100 }],
        interestScore: { min: 1, max: 5, labels: {} },
      }),
    ).toThrow('prompts is required');
  });

  it('rejects indicators without maxPoints', () => {
    expect(() =>
      assertCallAuditLlmConfig({
        version: '1',
        model: 'm',
        temperature: 0.1,
        indicators: [{ key: 'a', label: 'A', description: 'd' }],
        interestScore: { min: 1, max: 5, labels: {} },
        prompts: { system: 's', userTemplate: 'u {{transcript}}' },
        outputSchema: {},
      }),
    ).toThrow('maxPoints must be a positive integer');
  });

  it('rejects indicators whose maxPoints do not sum to 100', () => {
    expect(() =>
      assertCallAuditLlmConfig({
        version: '1',
        model: 'm',
        temperature: 0.1,
        indicators: [
          { key: 'a', label: 'A', description: 'd', maxPoints: 40 },
          { key: 'b', label: 'B', description: 'd', maxPoints: 40 },
        ],
        interestScore: { min: 1, max: 5, labels: {} },
        prompts: { system: 's', userTemplate: 'u {{transcript}}' },
        outputSchema: {},
      }),
    ).toThrow('must sum to 100');
  });
});
