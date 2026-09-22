# Formulario_Asado BBQ leads

## Ingress

- Gateway: `POST /webhooks/ceiba` → form name `formulario_asado*` → `customers.meta.leadgen.ingest.v1`
- customers-ms: upsert `meta_lead_campaigns` + Customer; assign ventor (keep existing assignee, refresh `assignedDate`); set `whatsappPotentialCustomerStatus=ready_for_llm`

## WhatsApp

- Template: `bbq_27_sept_notification` / language `es` / body `{{contact_name}}`
- Send once per `leadgenId` via `marketing_campaign.ms_ws` (customers WABA)
- Idempotency: `meta_lead_campaigns.notificationSentAt` + `whatsappMessageId`

## Button “Hablar con un asesor”

- Meta delivers `type=button` on customers WhatsApp ingress
- Existing `CustomerMetaInboundReplyService` sends assigned ventor contact card (`send.potential_customer_contacts`)
