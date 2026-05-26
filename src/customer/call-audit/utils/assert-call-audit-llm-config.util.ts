import type { CallAuditLlmConfig } from '../config/call-audit-llm.config';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Ensures parsed JSON matches the full {@link CallAuditLlmConfig} contract (no TS merge).
 */
export function assertCallAuditLlmConfig(raw: unknown): CallAuditLlmConfig {
  if (!isRecord(raw)) {
    throw new Error('call-audit-llm.config.json must be a JSON object');
  }
  const version = raw.version;
  const model = raw.model;
  const temperature = raw.temperature;
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('call-audit-llm.config.json: version is required');
  }
  if (typeof model !== 'string' || model.trim() === '') {
    throw new Error('call-audit-llm.config.json: model is required');
  }
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) {
    throw new Error('call-audit-llm.config.json: temperature must be a number');
  }
  if (!Array.isArray(raw.indicators) || raw.indicators.length === 0) {
    throw new Error('call-audit-llm.config.json: indicators must be a non-empty array');
  }
  if (!isRecord(raw.interestScore)) {
    throw new Error('call-audit-llm.config.json: interestScore is required');
  }
  const min = raw.interestScore.min;
  const max = raw.interestScore.max;
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new Error('call-audit-llm.config.json: interestScore.min and max are required');
  }
  if (!isRecord(raw.prompts)) {
    throw new Error('call-audit-llm.config.json: prompts is required');
  }
  const system = raw.prompts.system;
  const userTemplate = raw.prompts.userTemplate;
  if (typeof system !== 'string' || system.trim() === '') {
    throw new Error('call-audit-llm.config.json: prompts.system is required');
  }
  if (typeof userTemplate !== 'string' || userTemplate.trim() === '') {
    throw new Error('call-audit-llm.config.json: prompts.userTemplate is required');
  }
  if (!isRecord(raw.outputSchema)) {
    throw new Error('call-audit-llm.config.json: outputSchema is required');
  }
  return raw as CallAuditLlmConfig;
}
