# V2 lead agent — agent context (project + buyer gates)

Hand-off for `/crm-gtower-leads-scoring`. Canonical API surface: [`lead-conversation-v2.md`](lead-conversation-v2.md). V1: [`lead-conversation.md`](lead-conversation.md). Skill: `~/.cursor/skills/crm-gtower-leads-scoring/`.

## Product goal

WhatsApp AI qualifier on the **leads line**. Filter curiosity vs real buyers, then book a short advisor call. Do **not** sell the lot in chat. Do **not** dump morning/afternoon/night slots before project + buyer motivation are known.

## Repos / entry

| Piece | Where |
|---|---|
| Engine, stages, LLM, scoring | `crm-omega-customers-ms/src/lead-conversation/v2/` |
| Settings, FAQs, recovery, readiness, simulate | `crm-omega-customers-ms/src/lead-assistant/` |
| Meta form → V2 welcome + session seed | `crm-omega-customers-ms/src/meta-lead-forms/` |
| Send / mark-read / templates | `whatsapp_cloud_ms/src/lead-conversation/` |
| Webhook forward | `omega_gateway` `POST /webhooks/lead_conversation` |
| Admin UI | `crm_lots_agents` `/dashboard/lead-assistant`, `/dashboard/lead-conversations` |

Inbound: gateway → RMQ `customers.lead_conversation.inbound.v1` → flow resolver (`v2`) → `lead-agent-turn` BullMQ → `LeadAgentEngineService.executeTurn`.

## Happy path (stages)

```
opening → discovery → value → bridge → booking → booked
```

Code owns stage moves (`LeadAgentStageService`). LLM writes replies + extracts `profile` / `intents` / `action`.

1. **opening** — greet; confirm known project or ask project (WhatsApp selector follows). No prices, media, or call.
2. **discovery** — first: construir / inversión / solo explorando; then payment / timeline one question at a time. Never `offer_call_slots`.
3. **value** — benefits + optional video/plan.
4. **bridge** — propose call only if `canOfferCall`.
5. **booking / booked** — same `LeadCallSlotService` as V1 via slot bridge.

## Gates (do not regress)

### 1. Project always defined (confirmed vs suggested)

- Ad registry (`meta_lead_ad_campaigns`) maps Meta `campaignId` → RAG `projectId`.
- That mapping is a **soft suggestion** only (`suggestedProject` in the prompt). It does **not** set `needsProject: false` and does **not** stamp `session.projectId` on V2 welcome.
- Confirmed project = `session.projectId` after the customer confirms (interactive tap or LLM catalog `projectId`), **or** `session.isAllProjects` after `project:all`.
- Interactive picker: same V1 option ids (`project:<id>`, `project:all`) via `composeProjectPicker` / `buildProjectPicker`. Engine appends it when `needsProject` or LLM action `offer_projects`. Taps are adopted via `interactiveReplyId` **before** the LLM turn; do not re-append the picker on that same turn.
- Admin V2 restart / V1→V2 adoption (`buildLeadAgentSessionReset`) **`$unset`s** `projectId` + `projectTitle` so the next “Hola” asks again (selector appended).
- Stage stays in `opening` while `hasProject` is false (`projectId` unset and not `isAllProjects`).
- Prompt: `needsProject: true` until confirmed; model must **not** enumerate catalog names — selector follows. Use `offer_projects` to resend picker when switching project.
- Engine: without confirmed project gate, coerce `offer_call_slots` and `send_media` → `continue`. Media still requires a real `projectId` (not `isAllProjects` alone).

Key files: `meta-lead-form-qualification.service.ts`, `build-lead-agent-session-reset.util.ts`, `lead-agent-stage.service.ts`, `lead-agent-prompt.builder.ts`, `lead-agent-engine.service.ts`, `lead-message-composer.service.ts`.

### 2. Buyer before human call (`canOfferCall`)

`isLeadQualifiedToOfferCall` (`utils/lead-agent-can-offer-call.util.ts`):

- true if already on `ask_schedule` / `ask_call_slot`, **or**
- `projectId` set **and** motivation in `build | invest | leisure`.

`exploring` or missing motivation → no slots. Confirming project with "sí" is **not** `wants_call`. Stage jumps to `booking` only when `canOfferCall` and (`offer_call_slots` | slot step | `wants_call`).

**Motivation buttons:** when the project gate is open and `needsMotivation` (missing or `exploring`), the engine appends WhatsApp reply buttons via `composeAskMotivation` / `buildAskMotivation` (`mot:build`, `mot:invest`, `mot:exploring`). Taps are adopted from `interactiveReplyId` before the LLM; do not re-append on that same turn. Model must not enumerate the three options in text.

Prompt flags: `needsProject`, `needsMotivation`, `canOfferCall`. System + stage goals enforce this.

### 3. LLM-fail fallback (no loops)

When `LeadAgentLlmService.executeTurn` returns `null`:

| State | Fallback |
|---|---|
| Best FAQ match score >= `LEAD_FAQ_FALLBACK_MIN_SCORE` (200) | Send FAQ `answer` text, stay `v2_conversation`, `usedFaqIds: [id]` — **before** project/motivation/schedule |
| No project | Ask project text + interactive picker (`LEAD_AGENT_FALLBACK_ASK_PROJECT_REPLY` + `buildProjectPicker`) |
| Project, motivation still unknown | Parse pending text / `mot:*` tap; if still unknown → ask motivation text + buttons |
| Parsed `build`/`invest`/`leisure` | Treat as buyer-qualified → schedule fallback |
| Parsed / stored `exploring` | Acknowledge (`LEAD_AGENT_FALLBACK_EXPLORING_REPLY`) + motivation buttons (re-qualify); stay chat |

FAQ match: `pickBestLeadFaqMatch` / `scoreLeadFaqMatch` (`lead-assistant/utils/score-lead-faq-match.util.ts`) — containment, token overlap, and stem prefixes (e.g. `escrituras` ~ `escrituracion`).

Parser stems: construir / construi* / inversión / invertir / explorando / solo mirando / ocio / vacacion* (typos like `Construi4` → build).

**Bugs that shipped then fixed:** ask-motivation fallback ignored inbound “Construir” → loop; LLM-null + buyer dumped schedule instead of dictionary FAQ (e.g. escrituras).

## Predefined messages (not LLM)

Two sources of fixed copy:

1. **V2 constants** — `src/lead-conversation/v2/constants/lead-agent.constants.ts` (engine fallback / opt-out).
2. **Shared V1 templates** — `src/lead-conversation/templates/lead-conversation.templates.ts` (schedule buttons, slot list, booking confirmation, project picker, motivation buttons). V2 reuses them via `LeadFlowTransitionsService` when action is `offer_call_slots` / `offer_projects`, needs-project / needs-motivation append, or LLM-fail schedule/project/motivation fallback.

Normal turns use **LLM `replies[]`** (1–3 short texts). Predefined strings below only fire on fallback, opt-out, or slot UI.

### V2 engine constants

| Constant | When sent | Exact text |
|---|---|---|
| `LEAD_AGENT_FALLBACK_ASK_PROJECT_REPLY` | LLM null, no `projectId` | `Para orientarte bien, ¿qué proyecto te interesa? Puedes decirme el nombre y te ayudo con eso.` |
| `LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY` | LLM null, has project, motivation still unknown after parse | `Para enviarte solo lo que te sirva: ¿lo estás mirando para construir, como inversión, o solo estás explorando?` |
| `LEAD_AGENT_FALLBACK_EXPLORING_REPLY` | LLM null, motivation is/was parsed as `exploring` | `Perfecto, sin compromiso. Cuando quieras te cuento más del proyecto o de las formas de pago; dime qué te gustaría saber.` |
| `LEAD_AGENT_FALLBACK_REPLY` | LLM null **and** `canOfferCall` (buyer-qualified) — first outbound before period buttons | `Gracias por escribirnos. Para darte la información exacta prefiero que te la confirme uno de nuestros asesores en una llamada corta.` |
| `LEAD_AGENT_OPT_OUT_REPLY` | LLM (or path) action `opt_out` — replaces LLM replies | `Entendido, no te escribiremos más. Si más adelante quieres retomar, aquí estaremos.` |

Seeing `LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY` or `LEAD_AGENT_FALLBACK_REPLY` in WhatsApp almost always means **LLM turn returned null**, not a normal consultative turn.

### Schedule / slots (shared templates, used by V2)

Triggered by `transitions.buildAskSchedule()` / `buildAskCallSlot()` when `offer_call_slots` runs (LLM success with gate open, or buyer-qualified LLM-fail).

| Template key | Kind | Role |
|---|---|---|
| `askSchedule` | `buttons` | Body explains short advisor call + morning/afternoon/night windows; asks preferred period. Buttons: `En la Mañana 9-12`, `Tarde 2-5`, `Noche 6-9` (`REPLY_ID` `slot:morning|afternoon|night`). |
| `askCallSlot` | `list` | Free 30-min slots for the chosen period (`callslot:<ISO>`). |
| `noCallSlots` | text + period buttons | Period has no free slots → pick another period. |
| `callSlotTaken` | text + list | Race: slot taken → refresh list. |
| `confirmation` / `confirmationWithContact` | text (+ optional `contacts` vCard) | After book: advisor name + time. |

`askSchedule` body (abbrev.): advisor will call ~5 min; windows 9–12 / 2–5 / 6–9; “¿En qué horario te queda mejor que te llamemos?”

V2 LLM-fail buyer path (no FAQ hit): **`LEAD_AGENT_FALLBACK_REPLY`** (text) → gap → **`askSchedule`** (buttons). That pair = schedule dump. If a dictionary FAQ matches first, outbound is only the FAQ answer (no slots).

### FAQ dictionary (admin)

Stored in `lead_faqs`; resolved per turn into the LLM prompt. On LLM fail, a strong match answers with `defaultAnswer` / project answer directly. Fix weak alts in admin (e.g. typo `escricturado`) still helps ranking.

On a **successful** LLM turn that cites FAQs (`usedFaqIds`): reply is the knowledge answer only (`continue`). Do **not** append schedule buttons unless the customer asked to be called (`wants_call`). Booking stage goal no longer pushes “elige de la lista”.

### Welcome / recovery (Meta templates, admin-configured)

Not the engine constants. Sent as WhatsApp **marketing templates** on the leads WABA:

- **Welcome** — `lead_assistant_settings.welcomeTemplate` after Meta lead form delay (`lead_v2_welcome` draft in `lead-conversation-v2.md`). Variables: customer name, assistant, business, project title. May seed `projectId` on session when ad registry maps the campaign.
- **Recovery** — `lead_recovery_sequences` steps (day2 / day4 / day7 drafts). Silence after last inbound → next template; reply cancels and re-anchors.

### What is *not* predefined

- Stage greetings / discovery questions on a **successful** LLM turn — model output guided by `stageGoal` + system prompt + settings `greeting`.
- FAQ answers — from `lead_faqs` (general `defaultAnswer` or project override). Prompt includes `alternativePhrasings`; model must answer from the matched FAQ `answer` and set `usedFaqIds`. Admin dictionary: `/dashboard/lead-assistant?step=knowledge`.
- Media captions — from media plan builders when `send_media` is allowed.

## LLM

- Code: `src/lead-conversation/v2/lead-agent-llm.service.ts` (DeepSeek / OpenAI SDK). Orchestration: `lead-agent-engine.service.ts`.
- Config: `DEEPSEEK_API_KEY`, `deepseek.baseUrl`, model `LEAD_AGENT_LLM_MODEL` (default `deepseek-chat`).
- Null after 2 attempts → engine fallback (FAQ → project → motivation → schedule).
- Nest logs (`LeadAgentLlmService`): turn start (model, message count, last user snippet); each request attempt; response char length; turn ok / null after N; warn on missing key, request fail, parse-reject content snippet (`LEAD_AGENT_LLM_CONTENT_LOG_CHARS`).
- Symptom `Agent LLM turn null after 2 attempts` = fallback path, not “LLM unset”.

## Scoring (V2)

Signals recomputed each turn (not incremented): motivation_known 10, payment_known 10, timeline_soon 20 / later 5, budget_known 10, high_intent_question 20, accepted_call 10, call_booked 20. Cap 100. Temp: hot≥60 / warm 30–59 / cold&lt;30. `exploring` does **not** earn `motivation_known`.

## Env checklist (local)

- customers-ms: `DEEPSEEK_API_KEY`, `WHATSAPP_CLOUD_LEADS_PHONE_NUMBER_ID`, `RAG_URL` (omega_rag, often `:3003`), Redis, RabbitMQ.
- whatsapp_cloud_ms: same phone id + access token; `WHATSAPP_CLOUD_LEADS_WABA_ID` for template list.
- Form `flowStrategy: lead_conversation_v2` + `lead_assistant_settings.welcomeTemplate` set (else 409).

## Manual test

1. Restart customers-ms after code/env changes.
2. Admin: restart/delete session (`/dashboard/lead-conversations`). With assistant **enabled**, Restart converts V1→V2 clean (no project list); Delete + next inbound also forces V2 on a fresh session.
3. Inbound: greet → confirm project → answer construir → expect discovery/value or schedule **only after** motivation saved; never repeat the same ask-motivation line.
4. Watch logs: `LeadAgentLlmService` (null / content snippet) and outbound sends.

## Recent change set (this context)

1. **Ad registry soft-suggests** project (prompt `suggestedProject`); do **not** auto-confirm or stamp on V2 welcome.
2. **V2 restart clears** `projectId` / `projectTitle` so greeting-only turns ask catalog options again. Admin Restart with assistant enabled forces that V2 reset even from a V1 session.
3. **Qualify before call** — `canOfferCall` gate in engine / stage / prompts; LLM-fail no longer dumps schedule without buyer motivation.
4. **Parse motivation on fallback** — stop ask-motivation loop; exploring acknowledge path; LLM diagnostic logs.
5. **FAQ on LLM fail** — dictionary stem match answers before schedule dump; Nest logs each LLM request/response.
6. **Friendlier FAQ turns** — answering a FAQ uses `continue` (no “elige de la lista”); engine coerces `offer_call_slots` away unless intent `wants_call`.

## Do not

- Force payment/timeline before call once motivation is a buyer type (out of scope of the gate).
- Change V1 questionnaire behavior.
- Offer slots for unanswered FAQ deflection alone.
- Invent `projectId` outside catalog.
