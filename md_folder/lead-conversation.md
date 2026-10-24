# Lead conversation (AI WhatsApp qualifier)

Module: `src/lead-conversation/`. Scores Meta WhatsApp leads, saves answers, assigns a ventor once a call is scheduled.

## Flow
1. Meta → `omega_gateway` `POST /webhooks/lead_conversation` (no signature validation). The gateway emits `customers.lead_conversation.inbound.v1` on `crm.customers.whatsapp_integration`.
2. `LeadConversationInboundService`: parse → find/create customer (+ interestedProjects) → find/create session → dedupe by `wamid` → cancel reminder → state machine (optimistic `version` lock, 3 retries) → side effects → dispatch outbound.
3. Outbound goes through the BullMQ queue `lead-conversation-outbound`, one chained job per message with `delayMs` (plan +3s, lots +4s). Each job calls RPC `lead_conversation.send.v1` on `ws_ms_queue` (whatsapp_cloud_ms leads line). The last message of a question arms the reminder.
4. Reminder: queue `lead-conversation-reminder`, jobId `reminder-{sessionId}`, `LEAD_CONVERSATION_REMINDER_MS` (1h). Sí → resume `stepBeforeReminder`. No → `disqualified`, score 1, priority 1.

## Steps (`handlers/`, Strategy by `step`)
`initial` → (project detected ? intro + plan + lot ranges : `ask_project` list + "Me interesan todos")
`ask_project` → `ask_lot_range` | (todos) `ask_schedule`
`ask_lot_range` (+1) → `ask_payment` (+2) → `ask_schedule` (period buttons) → `ask_call_slot` (list of free 30-min slots, +3 on booking) → `scheduled` (confirmation with date + ventor assignment)
Invalid reply: retry up to `MAX_QUESTION_RETRIES=2`, then `abandoned`. Retries in `ask_call_slot` recompose the slot list.

## Call slots (`lead-call-slot.service.ts`)
- Periods (America/Bogota, fixed UTC-5): morning 9–12, afternoon 14–17, night 18–21. Reply ids `slot:morning|afternoon|night`.
- Slot = 30 min, start ≥ now + 30 min, within `LEAD_CALL_SLOT_LOOKAHEAD_DAYS` (default 7). Up to 10 next free slots of the chosen period are sent as a list (row id `callslot:<ISO>`; text reply by row number also works). No Sundays. A closed window or Bogota time ≥ 21:00 rolls to the next open day.
- Pool: office_back users with `assignAdvanceLeads=true` + `enable=true` (`GET {officeBackInternal.baseUrl}/internal/ventors/advance-leads-candidates`, header `X-Internal-Key`). A slot is free when ≥1 pool user has no overlapping pending event.
- Booking: least-loaded free user that Bogota day → `ventor_schedule_events` `{eventType:'call', source:'lead_conversation', leadConversationSessionId}`, customer `assignedTo` = that user. Idempotent per session (re-booking cancels the previous pending call).
- Race guard: unique partial index `uniq_pending_call_slot` `{userId, scheduledAt, eventType}` for pending calls; duplicate key → next free user; all taken → "slot taken" notice + fresh list. No slots in the period → back to `ask_schedule` with `noCallSlots`.
- answers: `horarioLlamada` (period), `fechaLlamada` (ISO slot start). Metadata `scheduledCallAt`.

Project detection: fuzzy match against cached omega_rag titles (`GET {RAG_URL}/rag/projects?enable=true`, 10-minute TTL), then OpenAI fallback (`LEAD_CONVERSATION_LLM_MODEL`).
Options: buttons when ≤3, list otherwise. Replies match by reply id, then title, number or keyword.

## Persistence
- `lead_conversation_sessions` (unique `waId + phoneNumberId`): step, status, answers `{rangoLote, formaPago, horarioLlamada, fechaLlamada}`, score, priority, scoreHistory, pendingOptions, assignedVentorId.
- `lead_conversation_messages` (unique partial `wamid`): transcript.
- `customer_metadata` (merged): `projectId`, `lotRange`, `paymentMethod` (financing/cash), `preferredCallTime` (morning/afternoon/night; legacy noon/evening), `scheduledCallAt`. The score stays on the session.

Priority: score ≥5 → 3, ≥2 → 2, else 1. `MAX_SCORE=6`.

## REST (`token` JWT)
- `GET /customer/:customerId/lead-conversation` returns a summary: score, priority, status, step, project, items[{key,label,value}].
- `GET /customer/:customerId/lead-conversation/messages?limit&before` returns `{items, nextBefore}` (oldest → newest).
- `GET /customer/lead-conversation/test` is the smoke test.

## Admin REST (`token` JWT, `/admin/customer` prefix)
`/sessions` segment avoids clash with `GET admin/customer/:customerId`.
- `GET /admin/customer/lead-conversations/sessions?status&step&search&page(0-based)&limit` → `{items[{sessionId, customerId, customerName, phone, projectTitle, isAllProjects, step, status, score, maxScore, priority, lastInboundAt, startedAt}], total, page, limit}`. `search` = waId / profileName / projectTitle.
- `GET .../sessions/:sessionId/messages?limit&before` → transcript page.
- `DELETE .../sessions/:sessionId` → cancel reminder, delete session + messages. Next inbound starts fresh. Queued outbound jobs of a deleted session are dropped by the processor.
- `POST .../sessions/:sessionId/restart` → cancel reminder, reset answers/score/project. If `lastInboundAt` < 24h (Meta window): step `ask_project` + welcome list sent → `{restarted, sent:true}`. Else step `initial`, nothing sent → `{sent:false, reason:'outside_customer_service_window'}`.

UI: crm_lots_agents `/dashboard/lead-conversations` (`src/features/lead-conversations/`, menu "Conversaciones IA leads", crmAdminOnly).

### Lead calls agenda (`lead-call-schedule-admin.controller.ts`)
Prefix `/admin/customer/lead-calls/agenda` (`/agenda` avoids the `:customerId` clash).
- `GET ?from&to(YYYY-MM-DD Bogota, ≤31 days)&userId&status` → `[{eventId, scheduledAt, status, source, userId, ventorName, customerId, customerName, phone, sessionId?, score?, maxScore, priority?, projectTitle?, note?}]` (all `eventType:'call'`).
- `GET /ventors` → `[{id, name}]` (assignAdvanceLeads pool).
- `PATCH /:eventId/reassign` `{userId?}` → pending only; target must be in the pool and free at that slot (omit = least-loaded free user); 409 otherwise. Moves customer `assignedTo` + session `assignedVentorId`.
- `PATCH /:eventId/status` `{status: done|cancelled}`.

UI: crm_lots_agents `/dashboard/lead-call-schedule` (`src/features/lead-call-schedule/`, menu "Agenda llamadas leads", crmAdminOnly): week grid by period × 30-min rows (mobile: day list), drawer with reassign / done / cancel. Toggle "Asignar Leads Calificados" in handle-user (`PUT users/set-user-assign-advance-leads/:userId` on office_back).

## Notes
- Empty omega_rag catalog is not cached; `ask_project` retries recompose the list (never replay a stale snapshot). `lastQuestion` stores only the interactive question.
- Plan image needs `RAG_PUBLIC_URL` reachable by Meta and a JPEG/PNG file (Meta rejects `.webp` images). If `RAG_PUBLIC_URL` is unset, every project gets the mock plan `https://back.laceiba.group/rag/uploads//projects/plane_riviera_beach_house_cartagena.pdf`, sent as a document.

UI: referrals-boost `ClientDetail` meta tab shows `client-detail-lead-qualification-section.tsx` and `lead-conversation-chat-sheet.tsx`.

## Env
customers-ms: `REDIS_URL`, `RAG_URL`, `RAG_PUBLIC_URL`, `DEEPSEEK_API_KEY`, `LEAD_CONVERSATION_LLM_MODEL` (default `deepseek-chat`), `LEAD_CONVERSATION_BRAND`, `LEAD_CONVERSATION_LOCATION`, `LEAD_CONVERSATION_REMINDER_MS`, `LEAD_CONVERSATION_ACTOR_ID`, `LEAD_CALL_SLOT_LOOKAHEAD_DAYS`, office_back internal base URL + API key (`officeBackInternal`).
office_back: user field `assignAdvanceLeads` ("Asignar Leads Calificados").
whatsapp_cloud_ms: `WHATSAPP_CLOUD_LEADS_PHONE_NUMBER_ID`, `WHATSAPP_CLOUD_LEADS_ACCESS_TOKEN`.

Templates: `templates/lead-conversation.templates.ts`. Tests: `lead-conversation-flow.spec.ts`, `lead-scoring.service.spec.ts`, `lead-call-slot.service.spec.ts`, `lead-call-schedule-admin.service.spec.ts`, `utils/matchers.util.spec.ts`.
