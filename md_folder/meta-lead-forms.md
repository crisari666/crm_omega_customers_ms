# Meta Lead Forms registry

Admin registry (`meta_lead_forms`) maps Meta Lead Ads **formId** / **formName** → CRM flow.

## Flows

| `flowStrategy` | Behavior |
|---|---|
| `immediate_assign` | Upsert customer + ventor assign (no BBQ template). Strategy is stamped on `meta_lead_campaigns.flowStrategy`. Lead-conversation bot **must not** reassign `assignedTo` (admin reassign still allowed). |
| `lead_conversation` | Upsert customer **without** assign; schedule delayed WhatsApp template on leads line. Bot may assign when a call is booked. |

If no enabled registry row matches: **hardcoded safety net** still runs for `datos_clientes*` / `formulario_asado*`. Other names skip assign (campaign saved with skip note). Legacy campaigns may omit `flowStrategy`; bot still keeps any existing `assignedTo`.

## Delay setting

Singleton `meta_lead_form_settings` (`key: default`):

- `outboundDelayMinutes` (default **2**)
- Admin: `GET/PATCH admin/customer/meta-lead-forms/settings`

On lead_conversation ingest → BullMQ job `meta-lead-form-qualification` delayed by that value. Inbound on leads line cancels job by phone/waId. On fire: skip if session already has inbound; else send welcome **template** via `lead_conversation.send.v1` (`kind: template`).

## Ceiba leadgen + CTWA WhatsApp redirect

Same Instant Form often hits Page `leadgen` (`POST /webhooks/ceiba` → `customers.meta.leadgen.ingest.v1`) **and** redirects the user into the leads WhatsApp line (`POST /webhooks/lead_conversation`). Leadgen owns Customer upsert / optional ventor assign. The CTWA inbound must resolve the **same** Customer (phone in form text when Meta omits `from`) and must not steal `assignedTo` when the bot later books a call slot. See `lead-conversation.md` § Ceiba leadgen ↔ CTWA WhatsApp bridge.

## Env

| Var | Default |
|---|---|
| `META_LEAD_FORM_WELCOME_TEMPLATE_NAME` | `lead_conversation_welcome` |
| `META_LEAD_FORM_WELCOME_TEMPLATE_LANGUAGE` | `es` |

Template must be approved on the **leads** WABA (24h window). Body param: `contact_name`.

## Admin API

`admin/customer/meta-lead-forms` — list / get / create / patch / delete (JWT admin).

## Gateway

`resolveRouteTarget` prefixes **unchanged**. Additive: `unknown` form names also emit `customers.meta.leadgen.ingest.v1` so registry can match.

## UI

crm_lots_agents → `/dashboard/meta-lead-forms` (ClientesV2, crmAdminOnly).
