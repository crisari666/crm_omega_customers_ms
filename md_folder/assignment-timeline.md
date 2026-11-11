# Assignment timeline (ventor × time)

Admin view of when leads were assigned to ventors. Source: `CustomerAssignmentChangeLog` (only rows with `assignedTo` set).

## API

`GET admin/customer/assignment-timeline` (JWT `token` header)

| Query | Notes |
|---|---|
| `dateFrom` / `dateTo` | ISO; filters change-log `createdAt` (assignment time) |
| `ventorId` | optional |
| `flowStrategy` | optional `immediate_assign` \| `lead_conversation` |
| `cursorBefore` | ISO; older page (`createdAt < cursor`) |
| `limit` | 1–200, default 100 |

Response: `{ windowFrom, windowTo, events[], nextCursorBefore?, hasMoreOlder }`

Event: `id`, `ventorId`, `customerId`, name/phone, `assignedAt`, `arrivedAt` (gateway → campaign → session → customer), `flowStrategy?`, `attendedAt?`.

## UI

crm_lots_agents `/dashboard/leads` → **Timeline asignaciones**. Rows = ventors; X-axis = time. Toggle **Por asignación** / **Por llegada**. Scroll left loads older via `cursorBefore`.

Unassigned `lead_conversation` leads (no change-log yet) do not appear until booking assigns a ventor.
