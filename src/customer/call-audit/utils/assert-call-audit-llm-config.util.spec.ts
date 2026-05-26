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
  });

  it('rejects JSON without prompts', () => {
    expect(() =>
      assertCallAuditLlmConfig({
        version: '1',
        model: 'm',
        temperature: 0.1,
        indicators: [{ key: 'a', label: 'A', description: 'd' }],
        interestScore: { min: 1, max: 5, labels: {} },
      }),
    ).toThrow('prompts is required');
  });
});
