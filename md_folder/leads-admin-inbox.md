# Leads admin inbox

Customer is SoR. Leads are `Customer` rows with `lifecycleStatus` + `leadSources` (no separate Lead collection).

## Schema

- `lifecycleStatus`: `lead` | `customer` (ingress creates as `lead`; convert promotes)
- `leadSources[]`: `meta_form` | `whatsapp_lead_conversation` | `whatsapp_inbound` | `manual` | `webinar` (append-only)
- Indexes: `{ lifecycleStatus, createdAt }`, `{ leadSources }`

## Ingress tags

| Path | Source tag |
|---|---|
| Meta leadgen | `meta_form` |
| WA lead conversation | `whatsapp_lead_conversation` |
| WA Meta webhook create | `whatsapp_inbound` |
| Manual admin create | `manual` |
| Webinar | `webinar` |

Assign may set `assignedTo` while lifecycle stays `lead` until convert.

## Admin API (JWT `/admin/customer`)

- `GET admin/customer/leads` — filters: `lifecycleStatus`, `source`, `assignedTo`, `search`, `from`, `to`, `page`, `limit`. Default filter = leads **and** converted customers with `leadSources`, plus legacy prospect heuristics. Use `lifecycleStatus=lead|customer` to narrow.
- `POST admin/customer/leads/:id/convert` — body `{ assignToUserId? }` → `lifecycleStatus=customer`, `isProspect=false`, optional assign.

**Routing:** `CustomerLeadsAdminController` must load before `CustomerAdminController` (static `leads` vs `:customerId`).

**Legacy:** docs missing `lifecycleStatus` with `isProspect: false` resolve as `customer` (`isPromoted`) so Convert is hidden. Backfill sets explicit `lifecycleStatus` where missing.

## Admin UI

`crm_lots_agents` → `/dashboard/leads` (menu Leads → Bandeja). Reuses `CustomerDetailDialogCP` + lead summary strip; convert CTA with optional ventor assign.
