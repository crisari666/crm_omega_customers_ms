# Ventor schedule (agenda) HTTP API

Base URL: same as [customer-api.md](./customer-api.md) — host + port + global prefix `customers-rest`.

Full path pattern: `{origin}/customers-rest/ventor-schedule/...`

**Headers (all routes)**

- `TOKEN: <office JWT>` — required (optional `Bearer ` prefix).
- `Content-Type: application/json` — for `POST` / `PATCH` bodies.

**Enums**

| Field | Values |
| --- | --- |
| `eventType` | `virtual`, `office`, `on_land`, `call` |
| `status` | `pending`, `done`, `cancelled` |

**Time zone**

`date` + `time` build `scheduledAt` in **UTC**. Day queries (`by-day`) use UTC midnight–midnight for the given `YYYY-MM-DD`.

---

## `POST /ventor-schedule`

Creates an event for the authenticated user (`userId` from JWT).

**Body**

```json
{
  "customerId": "<Mongo ObjectId string>",
  "date": "2026-04-22",
  "time": "14:30",
  "eventType": "office",
  "note": "optional"
}
```

**Response** — JSON object with `id`, `userId`, `customerId`, `scheduledAt` (ISO string), `eventType`, `note`, `status`, `createdAt`, `updatedAt`, and `customer` (`id`, `displayName`, `lastProjectId` when populated).

**Errors**

- `403` — customer not in scope (`createdBy` / `assignedTo` must match JWT user).
- `404` — invalid or missing customer id.

---

## `GET /ventor-schedule/by-day?date=YYYY-MM-DD`

Lists events for the JWT user on that UTC calendar day, sorted by `scheduledAt`.

**Response** — JSON array of the same event shape as `POST`.

---

## `PATCH /ventor-schedule/:id/status`

**Body**

```json
{ "status": "done" }
```

**Response** — single event object.

**Errors**

- `404` — event not found or not owned by user.

---

## Example `curl`

```bash
BASE='http://localhost:4001/customers-rest'
TOKEN='<jwt>'

curl -sS -X POST "$BASE/ventor-schedule" \
  -H "TOKEN: $TOKEN" -H "Content-Type: application/json" \
  -d '{"customerId":"...","date":"2026-04-22","time":"10:00","eventType":"virtual"}'

curl -sS "$BASE/ventor-schedule/by-day?date=2026-04-22" -H "TOKEN: $TOKEN"

curl -sS -X PATCH "$BASE/ventor-schedule/<eventId>/status" \
  -H "TOKEN: $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"done"}'
```
