# GET customer-down-payment/sales-report

Admin-only sales report over `customer_down_payments`.

**Auth:** office admin (`assertOfficeAdmin`).

**Query:** `recordedBy?`, `dateFrom?`, `dateTo?`, `projectId?`, `status?`, `skip?`, `limit?` (same as list; dates filter `createdAt`).

**Response:** `summary`, `byAgent`, `byProject`, `byDay`, paginated `rows`, `total`.
