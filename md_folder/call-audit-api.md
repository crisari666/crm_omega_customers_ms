# Call audit API (customers-ms)

Feature overview: [`call-audit-ai-feature-resume.md`](call-audit-ai-feature-resume.md).

LLM rubric SoT: `config/call-audit-llm.config.json` (v`2026-09-v3`, 8 weighted indicators, max **100** pts). TS defaults in `call-audit-llm.config.ts` when file absent.

Base: `admin/customer` (JWT `token` header).

## GET call-audit/config

Returns `configVersion`, `indicators[]` (each with `key`, `label`, `description`, `maxPoints`), `interestScore`, `requiredHumanAuditsPerMonth`.

## GET call-audit/ai-review?month=YYYY-MM&agentExternalRef=&onlyWithoutAi=&excludeWithoutTranscript=&skip=&limit=

CRM admin only. Lists answered VOIP/Meet calls with AI audit status.

`summary`: `{ dateBasis, totalEligible, aiCompleted, aiPending, aiFailed, aiNone, avgInterestScore, avgTotalScore, topFailedIndicators }`.

## GET call-audit/results?month=YYYY-MM&agentExternalRef=

Supervisor resume items include `interestScore`, `totalScore`, `maxScore`, `indicatorsSummary: { passed, total, failedLabels, earnedPoints, maxPoints, scorePercent }`.

## GET call-audit/auditor-progress?month=YYYY-MM

Auditor quota progress for the month.

## GET call-logs/:callLogId/audits

Returns `{ callLogId, callSid, transcript?, utterances?, human, ai }`.

## POST call-logs/:callLogId/audit

Human checklist: `{ indicators: [{ key, passed, rationale? }], interestScore, … }`. Server applies `maxPoints` → `pointsEarned` / `totalScore`.

## POST call-logs/:callLogId/audit/analyze

Re-runs DeepSeek with current config (upserts AI audit). Also auto-runs on VOIP `voice.call.transcription` and after Meet sync with transcript.
