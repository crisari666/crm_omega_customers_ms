# Meta Conversions API — CRM Lead event

## Trigger

When `CustomerService.setCustomerStep` changes `customerStepId` **to** the Lead step id (default `69e64b5c04041548fb4dcadf`), customers-ms POSTs a `Lead` event to Meta Conversions API. Fire-and-forget; step update never fails on Meta errors.

## Env

| Var | Default | Notes |
|---|---|---|
| `META_CAPI_ACCESS_TOKEN` | _(empty)_ | Required to send; skipped if missing |
| `META_CAPI_DATASET_ID` | `7399429630115923` | Dataset / pixel id |
| `META_CAPI_API_VERSION` | `v26.0` | Graph version |
| `META_CAPI_LEAD_STEP_ID` | `69e64b5c04041548fb4dcadf` | Pipeline step that fires the event |
| `META_CAPI_LEAD_EVENT_SOURCE` | `Omega CRM` | `custom_data.lead_event_source` |
| `META_CAPI_ENABLED` | `true` | Set `false` to disable |

Endpoint: `POST https://graph.facebook.com/{version}/{datasetId}/events?access_token=...`

## Customer fields stored

| Field | Source |
|---|---|
| `metaCtwaClid` | WhatsApp inbound `referral.ctwa_clid` |
| `metaFbclid` | Lead form mapped field `fbclid` / `click_id` / `fbc` (optional) |
| `metaLeadgenId` | Meta Lead Ads `leadgen_id` on ingest link |

## Payload notes

- `action_source`: `system_generated`
- `custom_data.event_source`: `crm`
- `user_data`: hashed `em`/`ph`/`fn`/`ln`; `lead_id` when numeric 15–17 digit leadgen id
- **Click IDs optional:** include `ctwa_clid` / `fbc` only when stored; omit otherwise — still send the event
