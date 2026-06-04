# WhatsApp marketing batch dispatch

- **Cron:** `WhatsappMarketingDispatchCronService` — `@Cron('*/5 * * * * *')` (every 5s).
- **Gate:** `WhatsappMarketingCampaign.nextBatchAt` — cron only runs `executeProcessCampaignBatch` when `nextBatchAt <= now` or `null`.
- **After each batch:** `nextBatchAt = now + batchDelayMs` (clamped 5s–20min).
- **Launch:** sets `status: sending`, `nextBatchAt: now` (first batch on next cron tick, ≤5s).
- **Limits:** `batchDelayMs` min `5000`, max `1200000`; `batchSize` 1–50.
