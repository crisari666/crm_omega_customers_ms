# GET admin/customer/assignment-changes

Lists rows from **`CustomerAssignmentChangeLog`** (dedicated collection) when `assignedTo` was set to the given office user, within a date range.

Written on each `assignedTo` change via `CustomerAuditService` (customer save hooks and query updates).

## Query (required)

| Param | Type | Description |
|-------|------|-------------|
| `assigneeUserId` | string | Office user id stored in `assignedTo` on the log row |
| `dateFrom` | ISO date string | Inclusive start (`createdAt >=`) |
| `dateTo` | ISO date string | Inclusive end (`createdAt <=`) |

Optional: `limit` (100 \| 200 \| 500, default 100), `skip` (default 0).

## Response

```json
{
  "items": [
    {
      "changeLogId": "...",
      "customerId": "...",
      "customerName": "Jane",
      "customerLastName": "Doe",
      "customerPhone": "+521234567890",
      "occurredAt": "2026-05-22T12:00:00.000Z",
      "actorUserId": "adminUserId",
      "assignedFrom": "previousUserId",
      "assignedTo": "assigneeUserId",
      "action": "update"
    }
  ],
  "total": 1,
  "limit": 100,
  "skip": 0
}
```

## Example

`GET /admin/customer/assignment-changes?assigneeUserId=64abc...&dateFrom=2026-05-01T00:00:00.000Z&dateTo=2026-05-22T23:59:59.999Z&limit=100`

Auth: same JWT `token` header as other `admin/customer` routes.
