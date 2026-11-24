# Lead conversation V2 (conversational AI qualifier)

Code: `src/lead-conversation/v2/` (engine, turn/recovery processors) + `src/lead-assistant/` (settings, FAQs, recovery, templates, readiness, simulator). V1 is documented in `lead-conversation.md` and is **unchanged**.

Agent hand-off (project/buyer gates + recent changes): [`lead-conversation-v2-agent-context.md`](lead-conversation-v2-agent-context.md).

## V1 vs V2
| | V1 | V2 |
|---|---|---|
| Style | Fixed questionnaire (project, lot, payment, period) | DeepSeek consultative chat grounded in omega_rag project data + FAQ base |
| Score | 0-6 (`MAX_SCORE`) | 0-100 from signals (`MAX_SCORE_V2`), temperature hot/warm/cold |
| Silent lead | 1h reminder | Template recovery sequence (admin-defined) |
| Booking | Slot service | Same `LeadCallSlotService` via slot bridge |
Goal: book a call with an advisor, never sell the lot in chat.

## Flow selection
- Meta form `flowStrategy = lead_conversation_v2` (see `meta-lead-forms.md`). Other strategies stay V1 for mid-flight sessions.
- Session `flowVersion: 'v1'|'v2'` (default v1). `LeadFlowResolverService`: v2 session stays v2; else only an untouched `initial` session may switch. When `settings.enabled`, that fresh inbound **always** converts to V2 (campaign strategy ignored — covers post-admin-delete). When disabled, stays V1.
- Admin Restart (`POST .../sessions/:id/restart`): if assistant enabled (or session already v2) → `buildLeadAgentSessionReset` (clean V2, no project list, `v2_waits_for_customer`). If disabled → legacy V1 ask_project send inside 24h window.
- Ingest: V2 form → `LeadAgentSessionAdoptionService` (convert pending V1 session) → delayed welcome template → V2 session created on `{waId, phoneNumberId}`.

## Session contract
- Step `v2_conversation` (no new statuses). Fields: `flowVersion`, `formId`, `leadProfile`, `scoreSignals[]`, `temperature`, `advisorBrief`, `lastTurnMessageId`, `recovery {anchorAt, sentStepIds[]}`, `optedOutAt`.
- Stages (`leadProfile.stage`): `opening → discovery → value → bridge → booking → booked`. Code moves stages; LLM only writes text and extracts data. Call offer requires `canOfferCall` (projectId + buyer motivation `build|invest|leisure`); `exploring`/missing motivation stays in chat. Confirming the project with "sí" is not `wants_call`. Already on `ask_schedule`/`ask_call_slot` keeps booking.
- Profile: motivation, experience, paymentMethod, timeline (`immediate|within_30_days|within_3_months|future|not_now`), budget, lotPreference, mainObjection, sentMedia.
- Score 0-100, recomputed from the signal set (never incremented): `motivation_known` 10, `payment_known` 10, `timeline_soon` 20 (immediate/30d/3m; `timeline_later` 5 for future/not_now, ignored if soon), `budget_known` 10, `high_intent_question` 20, `accepted_call` 10, `call_booked` 20. Temperature: hot ≥60, warm 30-59, cold <30. Priority hot 3 / warm 2 / cold 1. V2 transitions never carry `scoreEvent`; score travels in `sessionPatch`.
- Prompt context flags: `needsProject`, `needsMotivation`, `needsTimeToBuy`, `nextCaptureField`, `captureKnown`, `systemSendsFinancing`, `systemSendsGreeting`, `canOfferCall`. Project picker auto-appends only without confirmed project and without `suggestedProject` (Instant Form + campaign may adopt project). Guided path: project → motive → Financiado/De contado buttons → on Financiado only the monthly lot picker (`lot:{area}`, cuotas from `(price − separation) / maxInstallments`, no totals) → lot tap acks and opens schedule; on Contado opens schedule immediately. FAQ/unanswered still get `next:question` / `next:call`. Pre-booking capture interactive is payment only; `timeToBuy` / urgency / decision after booking. `LeadCaptureSyncService` upserts Stage-3 `customer_metadata` each turn. The configured greeting is prepended only when history has no inbound (a prior welcome template does not count). Engine coerces `offer_call_slots` (and `send_media` without project) to `continue` when gated.
- LLM turn JSON: `replies` (1-3), `profile`, `intents`, `action` (`continue|send_media|offer_call_slots|opt_out`), `media`, `callPeriod`, `projectId`, `usedFaqIds`, `unansweredQuestion`. Failure → parse motivation from pending text when possible (`Construir`/`construi4`/inversión/explorando); else ask project / ask motivation; `ask_schedule` only when buyer-qualified. Exploring → acknowledge, no slots.
- Recovery: `lead_recovery_sequences.steps[{id,label,offsetHours,enabled,template,sentCount,repliedCount}]`. Anchor = last inbound. Sends next template step; after all sent, closing job at +48h sets `abandoned`/cold. Customer reply cancels the job and re-anchors. Opt-out → `disqualified`, never contacted again.

## RabbitMQ (customers-ms → whatsapp_cloud_ms, queue `ws_ms_queue`)
- `lead_conversation.mark_read.v1` (emit): `{messageId, showTyping}` → Graph read receipt + typing indicator.
- `lead_conversation.templates.list.v1` (RPC, 15s): `{}` → `{success, error?, phoneNumberId?, templates[]}` (APPROVED only; `isSupported=false` for media header / dynamic URL button).
- `lead_conversation.send.v1` (RPC): adds `kind: 'video'` (`mediaUrl` + optional caption) and `kind: 'template'` (`templateName`, `languageCode`, `templateComponents`); result adds `errorCode?`.
- Delivery `statuses` webhooks update transcript `deliveryStatus` (`sent|delivered|read|failed`).

## BullMQ queues
- `lead-agent-turn`: job `agent-turn`, jobId `turn-{sessionId}-{wamid}`, delay = `replyDebounceSeconds`. Only the latest inbound owns the turn.
- `lead-agent-recovery`: job `recovery-step`, jobId `recovery-{sessionId}`, data `{sessionId, stepId|null, anchorAt}`.
- V2 dispatches never pass `questionAt` (V1 reminder disabled for v2).

## Admin routes (`token` JWT, office admin) `admin/customer/lead-assistant/*`
Each segment has `GET <segment>/test`.
- `settings` GET/PATCH (assistantName, businessName, greeting, pricePolicy, defaultInboundFlow, enabled, replyDebounceSeconds, welcomeTemplate)
- `faqs` GET/POST, `faqs/:id` PATCH/DELETE — each FAQ has `defaultAnswer` (all projects) + optional `projectAnswers[]` overrides; `alternativePhrasings` help matching. Resolver picks project answer over default, ranks by pending-text overlap then `timesUsed` (skipped on motivation-capture turns), caps at 60, and passes `{id,question,answer,alternativePhrasings}` into the prompt. Short motivation replies (e.g. “Construir”) do not reverse-match FAQs; newly captured buyer motivation skips FAQ fallback.
- `unanswered-questions` GET, `:id` PATCH, `:id/convert` POST
- `recovery` GET/PUT
- `templates?refresh=` GET (5 min cache)
- `readiness` GET (connection, identity, knowledge, recovery, activation)
- `simulate` POST (no Mongo writes, no sends, no booking)
Never register a single-segment `admin/customer/lead-assistant` (clashes with `admin/customer/:customerId`). Creating/updating a form as V2 without `welcomeTemplate` → 409.
Existing endpoints gain: summary `flowVersion/temperature/stage/advisorBrief/scoreSegments`; session list `flow` filter + `flowVersion/temperature/stage`; transcript `deliveryStatus/templateName`. Restart with assistant enabled (any V1 or V2 session) sends nothing (`reason: 'v2_waits_for_customer'`).
UI: crm_lots_agents `/dashboard/lead-assistant` — Knowledge step **Diccionario** (default) shows question + general answer + project exception chips; **Cobertura** matrix and unanswered inbox remain. referrals-boost score meter + advisor brief.

## Env vars
| Var | Repo | Default |
|---|---|---|
| `LEAD_AGENT_LLM_MODEL` | crm-omega-customers-ms | `deepseek-chat` |
| `LEAD_AGENT_LLM_TIMEOUT_MS` | crm-omega-customers-ms | `20000` |
| `WHATSAPP_CLOUD_LEADS_PHONE_NUMBER_ID` | crm-omega-customers-ms (and whatsapp_cloud_ms) | empty → V2 welcome creates no session and no recovery |
| `WHATSAPP_CLOUD_LEADS_WABA_ID` | whatsapp_cloud_ms | none (required for template list; token needs `whatsapp_business_management`) |
Also needed in prod: `RAG_PUBLIC_URL` (else only the mock plan, no video/brochure). V1 keeps `LEAD_CONVERSATION_LLM_MODEL`.

## Template drafts to submit to Meta (leads WABA, `es`, named variables, quick-reply buttons)
Adjust wording to real commercial conditions before submitting.
- `lead_v2_welcome`: `Hola {{customer_name}}, te saluda {{assistant_name}}, asistente virtual de {{business_name}}. Vi que te interesaron nuestros lotes en {{project_title}}. Para enviarte solo lo que te sirva, cuéntame: ¿lo estás mirando para construir o como inversión?` Buttons: `Para construir`, `Como inversión`, `Solo estoy mirando`.
- `lead_v2_recovery_day2`: `Hola {{customer_name}}, me acordé de tu consulta sobre {{project_title}}. ¿Quieres que te envíe un video corto de la zona y de los lotes disponibles esta semana?` Buttons: `Sí, envíamelo`, `Ahora no`.
- `lead_v2_recovery_day4`: `Hola {{customer_name}}, varios clientes me preguntaron esta semana por la financiación de {{project_title}}. Si quieres, te preparo una simulación sin compromiso para que veas cómo quedaría la cuota mensual.` Buttons: `Quiero la simulación`, `Más adelante`.
- `lead_v2_recovery_day7`: `Hola {{customer_name}}, como no he tenido respuesta, asumo que por ahora aplazaste la búsqueda de lote. Voy a cerrar tu solicitud para no incomodarte con más mensajes. Si quieres retomarla, escríbeme y con gusto continuamos.` Buttons: `Quiero retomar`, `Cerrar solicitud`.

Map variables in the admin UI (sources: `customer_first_name`, `assistant_name`, `business_name`, `project_title`, `static`). Templates with media header or dynamic URL buttons cannot be selected.

## Limits
Images are WebP (rejected by WhatsApp) so V2 sends videos (≤16 MB), the plan and the brochure only. Meta may refuse a marketing template per user; failure is recorded and the sequence continues. If the WhatsApp redirect beats the Lead Ads webhook, V1 may answer first.
