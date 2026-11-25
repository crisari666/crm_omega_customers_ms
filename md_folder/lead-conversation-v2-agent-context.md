# V2 lead agent — agent context (project + buyer gates)

Hand-off for `/crm-gtower-leads-scoring`. Canonical API surface: [`lead-conversation-v2.md`](lead-conversation-v2.md). V1: [`lead-conversation.md`](lead-conversation.md). Skill: `~/.cursor/skills/crm-gtower-leads-scoring/`.

## Product goal

WhatsApp AI qualifier on the **leads line**. Build rapport, understand needs, and earn trust before any advisor hand-off. Filter curiosity vs real buyers; advisor transfer is a **consequence** of an identified opportunity, not the goal of every turn. Do **not** sell the lot in chat. Do **not** dump morning/afternoon/night slots before project + buyer motivation are known.

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

Local debug: `LeadAgentEngineService` Nest logs resolve / greeting / applyProject / outbound; `LeadAgentGuidedPathService` logs financing / cashAck / nextStep decisions (`yarn start:dev`).

## Happy path (stages)

```
opening → discovery → value → bridge → booking → booked
```

Code owns stage moves (`LeadAgentStageService`). LLM writes replies + extracts `profile` / `intents` / `action`.

1. **opening** — greet; confirm known project, or (when `needsProject`) greet / soft-hint only — do **not** write the project question in LLM `replies` (WhatsApp selector follows). No prices, media, or call.
2. **discovery** — first: construir / inversión / solo explorando; then Financiado / De contado. Never `offer_call_slots`. No time-to-buy before booking.
3. **value** — FAQ / project facts; system may send financing installments + next-step buttons. Optional video/plan.
4. **bridge** — propose call only if `canOfferCall` when the lead wants to advance (no more questions / hablar con asesor).
5. **booking / booked** — same `LeadCallSlotService` as V1 via slot bridge; after booked, one late-capture interactive per turn (`timeToBuy` → urgency → decision).

## Gates (do not regress)

### 1. Project always defined (confirmed vs suggested)

- Ad registry (`meta_lead_ad_campaigns`) maps Meta `campaignId` → RAG `projectId`.
- **Meta V2 delayed welcome** (`executeStartAgentSession`): when the ad registry returns a `projectId`, the session is stamped with `projectId` / `projectTitle` at start (confirmed) so admin Lead Conversations can filter by project immediately.
- That mapping is otherwise a **soft suggestion** (`suggestedProject` in the prompt) until Instant Form adopt or customer confirm (inbound paths without welcome stamp).
- **Instant Form dump** with suggested project and **without** location rejection (“otra ciudad”) → engine **adopts** `session.projectId` immediately (no picker).
- Location rejection → leave unconfirmed; still **do not** auto-append the project picker (LLM explores; picker only via `offer_projects`).
- Confirmed project = `session.projectId` after welcome stamp / adopt / interactive tap / LLM catalog `projectId`, **or** `session.isAllProjects` after `project:all`.
- Interactive picker: same V1 option ids (`project:<id>`, `project:all`). Engine appends it only when there is **no** confirmed project **and no** `suggestedProject`, or when action is `offer_projects`.
- Admin V2 restart / V1→V2 adoption (`buildLeadAgentSessionReset`) **`$unset`s** `projectId` + `projectTitle` so the next “Hola” asks again (selector appended when no suggestion).
- Stage stays in `opening` while `hasProject` is false (`projectId` unset and not `isAllProjects`).
- Prompt: with `suggestedProject`, confirm in prose — do **not** assume a selector follows. Without suggestion and `needsProject`, do not write the project question in `replies` (selector follows).
- Engine: without confirmed project gate, coerce `offer_call_slots` and `send_media` → `continue`. Media still requires a real `projectId` (not `isAllProjects` alone).

Key files: `meta-lead-form-qualification.service.ts`, `build-lead-agent-session-reset.util.ts`, `lead-agent-stage.service.ts`, `lead-agent-prompt.builder.ts`, `lead-agent-engine.service.ts`, `lead-message-composer.service.ts`, `extract-form-fields-from-lead-text.util.ts`.

### 2. Buyer before human call (`canOfferCall`) + Stage-3 capture

`isLeadQualifiedToOfferCall` (`utils/lead-agent-can-offer-call.util.ts`):

- true if already on `ask_schedule` / `ask_call_slot`, **or**
- `projectId` set **and** motivation in `build | invest | leisure`.

`exploring` or missing motivation → no slots. Confirming project with "sí" is **not** `wants_call`. Stage jumps to `booking` only when `canOfferCall` and (`offer_call_slots` | slot step | `wants_call`).

**Motivation buttons:** when the project gate is open and `needsMotivation` (missing or `exploring`), the engine appends WhatsApp reply buttons via `composeAskMotivation` / `buildAskMotivation` (`mot:build`, `mot:invest`, `mot:exploring`). Taps are adopted from `interactiveReplyId` before the LLM; do not re-append on that same turn. Model must not enumerate the three options in text.

**Capture + financing guided path:** after project + motivation, the only outbound is Financiado / De contado (`pay:financed` / `pay:cash`). Greeting only on first customer inbound (`systemSendsGreeting`). On Financiado (or `asked_price` / `asked_financing`) with `pricePolicy !== defer_to_advisor`, system sends **only** the interactive lot picker from `ProjectKnowledge.financing` (body lists `- {{area}} m²: *{{monthly}}* pesos mensuales` with blank lines; button titles size-only; no totals; `maxInstallments` default 36). First inbound that names/adopts a project: greeting → project teaser → motive (teaser survives `withFirstGreeting`). Lot tap (`lot:{area}`) sets `lotPreference`, acks, and forces `offer_call_slots`. Contado forces schedule immediately. FAQ / unanswered still get `next:question` / `next:call`. Pre-booking interactive = payment only; after booking: `time:*` → urgency → decision. Prompt: `captureKnown`, `nextCaptureField`, `systemSendsFinancing`, `systemSendsGreeting`. LLM never invents cuota figures when `systemSendsFinancing` is true.

Prompt flags: `needsProject`, `needsMotivation`, `needsTimeToBuy`, `nextCaptureField`, `systemSendsFinancing`, `systemSendsGreeting`, `canOfferCall`. System + stage goals enforce this.

### 3. LLM-fail fallback (no loops)

When `LeadAgentLlmService.executeTurn` returns `null`:

| State | Fallback |
|---|---|
| Newly captured buyer motivation (`build`/`invest`/`leisure` from tap or free text while session was missing/`exploring`) | **Skip FAQ**; save motivation; stay `v2_conversation` with `LEAD_AGENT_FALLBACK_BUYER_CONTINUE_REPLY` (no schedule dump) |
| Else best FAQ match score >= `LEAD_FAQ_FALLBACK_MIN_SCORE` (200) | Send FAQ `answer` text, stay `v2_conversation`, `usedFaqIds: [id]` — before project/ask-motivation/chat |
| No project, no suggestedProject | Configured greeting text + interactive picker (`buildProjectPicker`) — greeting is not a second “qué proyecto” ask |
| No project, has suggestedProject | Greeting only (no auto picker); LLM/path explores or confirm soft project |
| Project, motivation still unknown | Parse pending text / `mot:*` tap; if still unknown → ask motivation text + buttons |
| Parsed / stored `build`/`invest`/`leisure` (and not already on slot step) | Chat continue (`LEAD_AGENT_FALLBACK_BUYER_CONTINUE_REPLY`); do **not** book |
| Already on `ask_schedule` / `ask_call_slot` | Keep slot UI (`LEAD_AGENT_FALLBACK_REPLY` + `askSchedule`) so booking is not stranded |
| Parsed / stored `exploring` | Acknowledge (`LEAD_AGENT_FALLBACK_EXPLORING_REPLY`) + motivation buttons (re-qualify); stay chat |

FAQ match: `pickBestLeadFaqMatch` / `scoreLeadFaqMatch` (`lead-assistant/utils/score-lead-faq-match.util.ts`) — forward containment, gated reverse containment (≥2 significant tokens and customer length ≥40% of phrase), token/stem overlap only for multi-token customer text (e.g. `escrituras` ~ `escrituracion`). Short replies like “Construir” do not reverse-match FAQs that merely contain that word.

On motivation-capture turns, FAQ resolve does not rank by pending text; free-text motivation is adopted into the prompt session (same stems as fallback).

Parser stems: construir / construi* / inversión / invertir / explorando / solo mirando / ocio / vacacion* (typos like `Construi4` → build).

**Bugs that shipped then fixed:** ask-motivation fallback ignored inbound “Construir” → loop; LLM-null + buyer dumped schedule instead of dictionary FAQ (e.g. escrituras); “Construir” reverse-matched construir/contado FAQ and dumped license/cash answer instead of capturing motivation.

## Predefined messages (not LLM)

Two sources of fixed copy:

1. **V2 constants** — `src/lead-conversation/v2/constants/lead-agent.constants.ts` (engine fallback / opt-out).
2. **Shared V1 templates** — `src/lead-conversation/templates/lead-conversation.templates.ts` (schedule buttons, slot list, booking confirmation, project picker, motivation buttons). V2 reuses them via `LeadFlowTransitionsService` when action is `offer_call_slots` / `offer_projects`, needs-project / needs-motivation append, or LLM-fail schedule/project/motivation fallback.

Normal turns use **LLM `replies[]`** (1–3 short texts). Predefined strings below only fire on fallback, opt-out, or slot UI.

### V2 engine constants

| Constant | When sent | Exact text |
|---|---|---|
| `LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY` | LLM null, has project, motivation still unknown after parse | `Para enviarte solo lo que te sirva: ¿lo estás mirando para construir, como inversión, o solo estás explorando?` |
| `LEAD_AGENT_FALLBACK_EXPLORING_REPLY` | LLM null, motivation is/was parsed as `exploring` | `Perfecto, sin compromiso. Cuando quieras te cuento más del proyecto o de las formas de pago; dime qué te gustaría saber.` |
| `LEAD_AGENT_FALLBACK_BUYER_CONTINUE_REPLY` | LLM null, buyer-qualified, not already on a slot step | `Listo, gracias por contarme. ¿Qué te gustaría saber del proyecto? Puedo ayudarte con ubicación, planos o formas de pago.` |
| `LEAD_AGENT_FALLBACK_REPLY` | LLM null **and** already on `ask_schedule` / `ask_call_slot` — first outbound before period buttons | `Gracias por escribirnos. Para darte la información exacta prefiero que te la confirme uno de nuestros asesores en una llamada corta.` |
| `LEAD_AGENT_OPT_OUT_REPLY` | LLM (or path) action `opt_out` — replaces LLM replies | `Entendido, no te escribiremos más. Si más adelante quieres retomar, aquí estaremos.` |

Seeing `LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY` or `LEAD_AGENT_FALLBACK_BUYER_CONTINUE_REPLY` in WhatsApp almost always means **LLM turn returned null**, not a normal consultative turn. LLM client disables DeepSeek thinking, salvages fenced JSON, and logs `reason=invalid_json|empty_replies` with a raw preview.

### Schedule / slots (shared templates, used by V2)

Triggered by `transitions.buildAskSchedule()` / `buildAskCallSlot()` when `offer_call_slots` runs (LLM success with gate open, or LLM-fail while already on a slot-choice step).

| Template key | Kind | Role |
|---|---|---|
| `askSchedule` | `buttons` | Body explains short advisor call + morning/afternoon/night windows; asks preferred period. Buttons: `En la Mañana 9-12`, `Tarde 2-5`, `Noche 6-9` (`REPLY_ID` `slot:morning|afternoon|night`). |
| `askCallSlot` | `list` | Free 30-min slots for the chosen period (`callslot:<ISO>`). |
| `noCallSlots` | text + period buttons | Period has no free slots → pick another period. |
| `callSlotTaken` | text + list | Race: slot taken → refresh list. |
| `confirmation` / `confirmationWithContact` | text (+ optional `contacts` vCard) | After book: advisor name + time. |

`askSchedule` body (abbrev.): advisor will call ~5 min; windows 9–12 / 2–5 / 6–9; “¿En qué horario te queda mejor que te llamemos?”

V2 LLM-fail buyer path (no FAQ hit, not already booking): **`LEAD_AGENT_FALLBACK_BUYER_CONTINUE_REPLY`** only — stay in chat. Schedule dump only if the session step is already `ask_schedule` / `ask_call_slot`. If a dictionary FAQ matches first, outbound is only the FAQ answer (no slots).

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
- Config: `DEEPSEEK_API_KEY`, `deepseek.baseUrl`, model `LEAD_AGENT_LLM_MODEL` (default `deepseek-chat`; API may return `deepseek-flash`).
- JSON mode: `response_format: json_object` on **both** attempts. System prompt has a top **REGLA CRÍTICA DE FORMATO** and bottom **CONTRATO DE RESPUESTA** + EXAMPLE JSON OUTPUT (DeepSeek blanks unrecognized output into spaces). `LEAD_AGENT_LLM_MAX_TOKENS` = 1200. Attempt 2 keeps `json_object`, appends a short reminder system message, uses temperature `0.2`, then salvages/parses.
- Null after 2 attempts → engine fallback (FAQ → picker-only / motivation buttons / buyer-continue; schedule only if already on a slot step). Do **not** paper over LLM failure with more canned content scripts.
- Nest logs (`LeadAgentLlmService`): turn start; each attempt (`jsonFormat`, returned model, finish, hasReasoning, chars); turn ok / null; reject reason + content preview.
- Symptom whitespace-only `content` with `finish_reason=stop` = DeepSeek JSON blanking, not “model silent”.

## Scoring (V2)

Signals recomputed each turn (not incremented): motivation_known 10, payment_known 10, timeline_soon 20 / later 5, budget_known 10, high_intent_question 20, accepted_call 10, call_booked 20. Cap 100. Temp: hot≥60 / warm 30–59 / cold&lt;30. `exploring` does **not** earn `motivation_known`.

## Env checklist (local)

- customers-ms: `DEEPSEEK_API_KEY`, `WHATSAPP_CLOUD_LEADS_PHONE_NUMBER_ID`, `RAG_URL` (omega_rag, often `:3003`), Redis, RabbitMQ.
- whatsapp_cloud_ms: same phone id + access token; `WHATSAPP_CLOUD_LEADS_WABA_ID` for template list.
- Form `flowStrategy: lead_conversation_v2` + `lead_assistant_settings.welcomeTemplate` set (else 409).

## Manual test

1. Restart customers-ms after code/env changes.
2. Admin: restart/delete session (`/dashboard/lead-conversations`). With assistant **enabled**, Restart converts V1→V2 clean (no project list); Delete + next inbound also forces V2 on a fresh session.
3. Inbound: greet (picker alone if LLM null / no project) → confirm project → answer construir → expect chat continue or discovery/value, **not** an immediate schedule dump; never repeat the same ask-motivation line. Watch logs for `Agent LLM turn ok` (prompt path) vs `turn null` + `reason=`.
4. Watch logs: `LeadAgentLlmService` (null / content snippet) and outbound sends.

## Recent change set (this context)

1. **Ad registry soft-suggests** project (prompt `suggestedProject`); do **not** auto-confirm or stamp on V2 welcome.
2. **V2 restart clears** `projectId` / `projectTitle` so greeting-only turns ask catalog options again. Admin Restart with assistant enabled forces that V2 reset even from a V1 session.
3. **Qualify before call** — `canOfferCall` gate in engine / stage / prompts; LLM-fail no longer dumps schedule without buyer motivation.
4. **Parse motivation on fallback** — stop ask-motivation loop; exploring acknowledge path; LLM diagnostic logs.
5. **FAQ on LLM fail** — dictionary stem match answers before schedule dump; Nest logs each LLM request/response.
6. **Friendlier FAQ turns** — answering a FAQ uses `continue` (no “elige de la lista”); engine coerces `offer_call_slots` away unless intent `wants_call`.
7. **Motivation before FAQ** — gated reverse containment + skip FAQ when “Construir” (etc.) newly captures buyer motivation; free-text motivation adopted into prompt / FAQ ranking skipped on that turn.
8. **Relationship-first prompt** — system + opening stage goals prioritize rapport over rushing a call; when `needsProject`, LLM must not re-ask project in text (selector only), mirroring motivation buttons.
9. **LLM-null no longer books** — buyer-qualified fail stays in chat (`LEAD_AGENT_FALLBACK_BUYER_CONTINUE_REPLY`); no-project fail is picker alone.
10. **DeepSeek JSON setup** — top/bottom JSON contract + EXAMPLE in system prompt; higher max_tokens; retry keeps `json_object` + reminder system message (does not drop JSON mode into plain prose).

## Do not

- Force payment/timeline before call once motivation is a buyer type (out of scope of the gate).
- Change V1 questionnaire behavior.
- Offer slots for unanswered FAQ deflection alone.
- Invent `projectId` outside catalog.
