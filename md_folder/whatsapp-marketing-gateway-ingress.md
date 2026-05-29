# WhatsApp marketing — Meta ingress (gateway only)

Meta WABA webhooks must target **omega_gateway** (`POST /webhooks/customers` or `/webhooks/meta`), not `whatsapp_cloud_ms`.

| Event | Gateway pattern | Handler |
|-------|-----------------|---------|
| Inbound reply (button/text + `context.id`) | `customers.meta.webhook.ingress.v1` | `WhatsappMarketingRecoveryReplyService` — preserve step → keep assignee + discount text; other steps → assign if unassigned or **reassign** ventor (load balance, exclude current) + assignment template via `potential_customers.ms_ws` |
| Outbound status (sent/delivered/read/failed) | same | `CustomerMetaWebhookService` → `WhatsappMarketingStatusService` |
| Outbound send | RMQ `marketing_campaign.ms_ws` | `whatsapp_cloud_ms` (send only) |

`customers.whatsapp.marketing.reply.v1` / `.message.status.v1` on customers-ms are legacy (ws_cloud webhook); not used when Meta hits gateway only.
