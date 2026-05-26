# Call audit API (customers-ms)

LLM rubric: full config in `config/call-audit-llm.config.json` (validated on load). TypeScript `call-audit-llm.config.ts` is types + default only when the file is absent.

Base: `admin/customer` (JWT `token` header).

## GET call-audit/config

Returns `configVersion`, `indicators[]`, `interestScore`, `requiredHumanAuditsPerMonth`.

## GET call-audit/ai-review?month=YYYY-MM&agentExternalRef=&onlyWithoutAi=&skip=&limit=

CRM admin only (`UserLevel.admin` = 0). Lists answered calls with transcript and AI audit status.

## GET call-audit/progress?month=YYYY-MM&agentExternalRef=

Returns `{ month, required, agents: [{ agentExternalRef, humanAuditCount, required, pendingCallLogIds[] }] }`.

## GET call-logs/:callLogId/audits

Returns `{ callLogId, callSid, human, ai }` audit records or null.

## POST call-logs/:callLogId/audit

Body: `{ indicators: [{ key, passed, rationale? }], interestScore, interestScoreRationale?, reviewerNotes?, speakerTurns? }`.

## POST call-logs/:callLogId/audit/analyze

Triggers DeepSeek analysis (also runs automatically on `voice.call.transcription`).
