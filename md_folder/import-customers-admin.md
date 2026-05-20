# POST admin/customer/import

Bulk import customers from admin CSV. Per-row results; HTTP 200 even when some rows already exist.

## Request

`POST /customers-rest/admin/customer/import`

Body:

```json
{
  "customers": [
    { "phone": "+521234567890", "name": "Jane", "email": "j@x.com", "assignedTo": "<officeUserId>" }
  ]
}
```

- Max 500 rows.
- `phone` required; `name`, `email`, `assignedTo` optional.
- `assignedTo` applied only on **new** creates; existing phones return `already_exists` without changing assignee.

## Response

```json
{
  "results": [
    { "phone": "521234567890", "status": "created", "customerId": "..." },
    { "phone": "...", "status": "already_exists", "customerId": "..." },
    { "phone": "...", "status": "error", "message": "..." }
  ]
}
```

Statuses: `created` | `already_exists` | `error`.
