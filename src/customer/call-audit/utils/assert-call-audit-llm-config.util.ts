import type {
  CallAuditLlmConfig,
  CallAuditLlmIndicatorConfig,
} from '../config/call-audit-llm.config';

const EXPECTED_INDICATOR_POINTS_SUM = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertIndicator(raw: unknown, index: number): CallAuditLlmIndicatorConfig {
  if (!isRecord(raw)) {
    throw new Error(
      `call-audit-llm.config.json: indicators[${index}] must be an object`,
    );
  }
  const key = raw.key;
  const label = raw.label;
  const description = raw.description;
  const maxPoints = raw.maxPoints;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error(
      `call-audit-llm.config.json: indicators[${index}].key is required`,
    );
  }
  if (typeof label !== 'string' || label.trim() === '') {
    throw new Error(
      `call-audit-llm.config.json: indicators[${index}].label is required`,
    );
  }
  if (typeof description !== 'string' || description.trim() === '') {
    throw new Error(
      `call-audit-llm.config.json: indicators[${index}].description is required`,
    );
  }
  if (
    typeof maxPoints !== 'number' ||
    !Number.isFinite(maxPoints) ||
    !Number.isInteger(maxPoints) ||
    maxPoints <= 0
  ) {
    throw new Error(
      `call-audit-llm.config.json: indicators[${index}].maxPoints must be a positive integer`,
    );
  }
  return {
    key: key.trim(),
    label: label.trim(),
    description: description.trim(),
    maxPoints,
  };
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
  const maxTokensRaw = raw.maxTokens;
  const maxTokens =
    typeof maxTokensRaw === 'number' && Number.isFinite(maxTokensRaw) && maxTokensRaw >= 1024
      ? Math.round(maxTokensRaw)
      : 8192;
  if (!Array.isArray(raw.indicators) || raw.indicators.length === 0) {
    throw new Error('call-audit-llm.config.json: indicators must be a non-empty array');
  }
  const indicators = raw.indicators.map((item, index) =>
    assertIndicator(item, index),
  );
  const pointsSum = indicators.reduce(
    (sum, indicator) => sum + indicator.maxPoints,
    0,
  );
  if (pointsSum !== EXPECTED_INDICATOR_POINTS_SUM) {
    throw new Error(
      `call-audit-llm.config.json: indicators maxPoints must sum to ${EXPECTED_INDICATOR_POINTS_SUM} (got ${pointsSum})`,
    );
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
  return {
    version: version.trim(),
    model: model.trim(),
    temperature,
    maxTokens,
    indicators,
    interestScore: raw.interestScore as CallAuditLlmConfig['interestScore'],
    prompts: {
      system: system.trim(),
      userTemplate: userTemplate.trim(),
    },
    outputSchema: raw.outputSchema as CallAuditLlmConfig['outputSchema'],
  };
}
