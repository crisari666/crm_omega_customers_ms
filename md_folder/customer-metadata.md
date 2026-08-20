# Customer metadata (Stage 3 qualification)

Collection: `customer_metadata` (one doc per customer). Catalog is code-defined in `customer-metadata-field.catalog.ts`.

## GET `customer/:customerId/metadata`

Returns catalog + stored values + completeness. Empty `values` when no doc yet. 404 if customer missing.

```json
{
  "customerId": "...",
  "fields": [{ "key": "economicCapacity", "type": "select", "required": true, "optionCodes": ["0_10m", "10_20m", "…", "230_240m"] }],
  "values": { "city": "Medellín" },
  "completedRequiredCount": 1,
  "requiredCount": 8,
  "isComplete": false
}
```

## PUT `customer/:customerId/metadata`

Body: `{ "values": { "economicCapacity": "20_30m", "city": "Cali", ... } }`

- Rejects unknown keys and invalid select codes
- Upserts the document; sets `updatedBy` from JWT
- Does **not** block pipeline step changes

## Required keys

`economicCapacity`, `city`, `timeToBuy`, `paymentMethod`, `buyMotive`, `projectId`, `urgencyLevel`, `decisionMaker`

`economicCapacity` options: `$0M-$10M` steps through `$230M-$240M` (`0_10m` … `230_240m`).
