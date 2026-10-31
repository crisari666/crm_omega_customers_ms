# Ventor mine visibility (per-step days)

- Step field: optional `ventorMineVisibilityDays` (≥ 1). Empty → mine list uses **30** days.
- Window start: customer `assignedDate`, else `createdAt`.
- `PATCH admin/customer/:id/assignee` stamps `assignedDate` on assign.
- One-off backfill: `scripts/backfill-ventor-mine-visibility.mongosh.js`
