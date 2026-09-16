# Ventor mine events summary

`POST customer/mine/events-summary` (JWT `token` header).

Body: `{ customerIds: string[] }` (max 500 MongoIds).

Returns `{ items: [{ eventType, count }] }` where `count` is **distinct customers** with ≥1 event of that type logged by the JWT user on ventor-scoped customers (`createdBy` or `assignedTo`). Duplicate VOIP/Meet rows of the same type on one customer count as 1.
