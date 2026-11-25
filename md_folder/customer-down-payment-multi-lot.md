# Multi-lot down payments (index cutover)

Uniqueness is `(customerId, projectId, lotNumber)` — one separación per lot, multiple lots per project allowed.

**Deploy (Mongo):** old unique index is not dropped by Mongoose automatically.

```js
db.customer_down_payments.dropIndex('customerId_1_projectId_1')
db.customer_down_payments.createIndex(
  { customerId: 1, projectId: 1, lotNumber: 1 },
  { unique: true, name: 'customerId_1_projectId_1_lotNumber_1' },
)
```

Restart customers-ms after index swap.
