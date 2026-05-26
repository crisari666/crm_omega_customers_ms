import type { CallAuditLlmConfig } from '../config/call-audit-llm.config';
import type { CallAuditLlmAnalysisResult } from '../types/customer-call-audit.type';
import {
  CALL_AUDIT_SPEAKER_AGENT,
  CALL_AUDIT_SPEAKER_CUSTOMER,
} from '../constants/call-audit.constant';
import { normalizeCallAuditLlmJsonContent } from './normalize-call-audit-llm-json.util';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSpeakerTurns(
  raw: unknown,
): CallAuditLlmAnalysisResult['speakerTurns'] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const turns: NonNullable<CallAuditLlmAnalysisResult['speakerTurns']> = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const roleRaw = String(item.role ?? '').toLowerCase();
    const role =
      roleRaw === CALL_AUDIT_SPEAKER_AGENT || roleRaw === 'asesor'
        ? CALL_AUDIT_SPEAKER_AGENT
        : roleRaw === CALL_AUDIT_SPEAKER_CUSTOMER ||
            roleRaw === 'cliente' ||
            roleRaw === 'customer'
          ? CALL_AUDIT_SPEAKER_CUSTOMER
          : null;
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (role === null || text === '') {
      continue;
    }
    turns.push({ role, text });
  }
  if (turns.length === 0) {
    return undefined;
  }
  return turns;
}

function parseIndicators(
  raw: unknown,
  config: CallAuditLlmConfig,
): CallAuditLlmAnalysisResult['indicators'] {
  const byKey = new Map<string, CallAuditLlmAnalysisResult['indicators'][0]>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item)) {
        continue;
      }
      const key = typeof item.key === 'string' ? item.key.trim() : '';
      if (key === '') {
        continue;
      }
      byKey.set(key, {
        key,
        passed: item.passed === true,
        rationale:
          typeof item.rationale === 'string' ? item.rationale.trim() : undefined,
        evidence:
          typeof item.evidence === 'string' ? item.evidence.trim() : undefined,
      });
    }
  }
  const result: CallAuditLlmAnalysisResult['indicators'] = [];
  for (const indicator of config.indicators) {
    const parsed = byKey.get(indicator.key);
    if (parsed === undefined) {
      throw new Error(`Missing indicator key: ${indicator.key}`);
    }
    result.push(parsed);
  }
  return result;
}

function clampInterestScore(value: number, config: CallAuditLlmConfig): number {
  const min = config.interestScore.min;
  const max = config.interestScore.max;
  const rounded = Math.round(value);
  if (rounded < min) {
    return min;
  }
  if (rounded > max) {
    return max;
  }
  return rounded;
}

/**
 * Parses and validates DeepSeek JSON output for call audit analysis.
 */
export function parseCallAuditLlmResponse(
  rawJson: string,
  config: CallAuditLlmConfig,
): CallAuditLlmAnalysisResult {
  const normalized = normalizeCallAuditLlmJsonContent(rawJson);
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized) as unknown;
  } catch {
    throw new Error(
      'LLM response is not valid JSON (often caused by max_tokens truncation on long calls)',
    );
  }
  if (!isRecord(parsed)) {
    throw new Error('LLM response must be a JSON object');
  }
  const indicators = parseIndicators(parsed.indicators, config);
  const scoreRaw = parsed.interestScore;
  if (typeof scoreRaw !== 'number' && typeof scoreRaw !== 'string') {
    throw new Error('interestScore is required');
  }
  const interestScore = clampInterestScore(Number(scoreRaw), config);
  const interestScoreRationale =
    typeof parsed.interestScoreRationale === 'string'
      ? parsed.interestScoreRationale.trim()
      : undefined;
  const speakerTurns = parseSpeakerTurns(parsed.speakerTurns);
  return {
    speakerTurns,
    indicators,
    interestScore,
    interestScoreRationale,
  };
}
