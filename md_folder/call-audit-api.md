# Call audit API (customers-ms)

LLM rubric: full config in `config/call-audit-llm.config.json` (validated on load). TypeScript `call-audit-llm.config.ts` is types + default only when the file is absent.

Base: `admin/customer` (JWT `token` header).

## GET call-audit/config

Returns `configVersion`, `indicators[]`, `interestScore`, `requiredHumanAuditsPerMonth`.

## GET call-audit/ai-review?month=YYYY-MM&agentExternalRef=&onlyWithoutAi=&skip=&limit=

CRM admin only (`UserLevel.admin` = 0). Lists answered calls with transcript and AI audit status.

Month membership uses **call date** (`completedAt` from Twilio `completed` event; fallback `createdAt`), not AI `analyzedAt`.

Returns `{ month, items[], total, skip, limit, summary }` where `summary` is `{ dateBasis: 'callCompletedAt', totalEligible, aiCompleted, aiPending, aiFailed, aiNone, avgInterestScore, topFailedIndicators: [{ label, count }] }` for the full filtered set (before pagination).

## GET call-audit/results?month=YYYY-MM&agentExternalRef=

Supervisor resume: `{ month, items[] }` where each item is `{ callLogId, callSid, agentExternalRef, completedAt?, auditorUserId, reviewerNotes?, interestScore, indicatorsSummary: { passed, total, failedLabels[] }, analyzedAt? }`.

## GET call-audit/auditor-progress?month=YYYY-MM

Auditor quota: `{ month, required, auditors: [{ auditorUserId, humanAuditCount }] }` (counts all human audits in month per `auditorUserId`).

## GET call-logs/:callLogId/audits

Returns `{ callLogId, callSid, human, ai }` audit records or null.

## POST call-logs/:callLogId/audit

Body: `{ indicators: [{ key, passed, rationale? }], interestScore, interestScoreRationale?, reviewerNotes?, speakerTurns? }`.

403 if another user already owns the human audit (`auditorUserId` is immutable after first save).

## POST call-logs/:callLogId/audit/analyze

Triggers DeepSeek analysis (also runs automatically on `voice.call.transcription`).
