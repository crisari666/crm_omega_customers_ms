# Meta potential-customer WhatsApp funnel — change summary

Short reference for onboarding a new chat or reviewer. Spans **omega_gateway**, **crm-omega-customers-ms**, **whatsapp_cloud_ms**, **omega_office_back**.

---

## Goal

Inbound WhatsApp (Meta Cloud API) for a **dedicated CRM WABA** → persist **Customer** + conversations in **customers-ms** → send **`potential_customer`** template (es) → user completes **WhatsApp Flow** → assign **physical ventor** (load-balanced, 28 days) → notify customer in Spanish → existing customers can get **LLM** replies (gated on CRM lookup).

**Isolation:** This path does **not** fan out to `crm_back_queue` / `omega_office_back` **`LeadCandidate`** onboarding. Data lives in **customers-ms** `Customer` collection only (unless a future sync is added).

---

## End-to-end flow

```mermaid
sequenceDiagram
  participant Meta
  participant Gateway as omega_gateway
  participant Customers as crm_omega_customers_ms
  participant WsMs as whatsapp_cloud_ms
  participant Office as omega_office_back

  Meta->>Gateway: POST /webhooks/meta or /webhooks/customers
  Gateway->>Customers: RMQ customers.meta.webhook.ingress.v1
  Note over Customers: find/create Customer, upsert chat+message (crmMessage)
  Customers->>WsMs: RMQ potential_customers.ms_ws (template)
  WsMs->>Meta: template potential_customer es
  Meta->>WsMs: POST webhook (nfm_reply flow)
  WsMs->>Customers: RMQ customers.whatsapp.flow.completed.v1
  Note over Customers: patch Customer, pick ventor, assign, change log
  Customers->>WsMs: RMQ potential_customers.ms_ws (assignment text)
  WsMs->>Meta: text message
```

---

## omega_gateway

| HTTP | Behavior |
|------|----------|
| `POST /webhooks/meta` | Envelope → **`customers.meta.webhook.ingress.v1`** on queue `crm.customers.whatsapp_integration`. Does **not** emit to `ws_ms_queue` / `crm_back_queue` (commented out). |
| `POST /webhooks/customers` | Same ingress pattern; envelope `source: 'customers'`. **Not** `whatsapp_customers_event` / whatsapp_ms anymore. |
| `GET /webhooks/customers` | Meta verify challenge (unchanged). |

**Files:** `src/webhook/webhook.service.ts`, `src/webhook/types/webhook-entry.type.ts` (`source: 'meta' \| 'customers'`).

**Optional env (if re-enabled):** `META_WEBHOOK_EXCLUSIVE_PHONE_NUMBER_IDS` — comma-separated `metadata.phone_number_id` allowlist (only forward matching WABA).

---

## crm-omega-customers-ms

### RabbitMQ

| Pattern | Role |
|---------|------|
| `customers.meta.webhook.ingress.v1` | Ingest Meta webhook envelope from gateway |
| `customers.whatsapp.flow.completed.v1` | Flow completion from whatsapp_ms |
| (outbound) `potential_customers.ms_ws` | Commands to whatsapp_ms on **`ws_ms_queue`** |

Queue consumed: `crm.customers.whatsapp_integration` (see `configuration.ts` `integrationQueue`).

### Main services / controllers

| File | Responsibility |
|------|----------------|
| `customer-meta-webhook-rmq.controller.ts` | `@EventPattern('customers.meta.webhook.ingress.v1')` |
| `customer-meta-webhook.service.ts` | Parse Meta `entry[].changes[]` (`field === 'messages'`), normalize `wa_id`, create/find **Customer**, upsert chat/message, emit template when needed (**structured logs**) |
| `customer-whatsapp-flow-completed-rmq.controller.ts` | `@EventPattern('customers.whatsapp.flow.completed.v1')` |
| `customer-whatsapp-flow-completed.service.ts` | Map flow JSON → Customer fields, fetch ventors from office_back, 28-day assignment counts, assign, audit, emit assignment WhatsApp text |
| `customer-potential-customers-outbound.service.ts` | `WS_MS_QUEUE` → `emit('potential_customers.ms_ws', …)` |

### Schema changes

**`customer.schema.ts`**

- `whatsappPotentialCustomerStatus`: `none` \| `pending_flow` \| `completed_flow` \| `ready_for_llm`
- `metaPotentialTemplateSent`: boolean
- JSDoc: not synced to office_back `LeadCandidate` by default

**`customer-whatsapp-chat.schema.ts`**

- `crmMessage: boolean` — Meta gateway ingest (no referral `userSessionId`)

### Template send conditions (`customer-meta-webhook.service`)

Emit `send.potential_customer_template` when:

- Customer **just created** OR `whatsappPotentialCustomerStatus === 'pending_flow'`
- AND `metaPotentialTemplateSent !== true`
- AND status is not `ready_for_llm`

Stable IDs: `sessionId = cloud:{phoneNumberId}:{waId}`, `chatId = normalizedWaId`.

### Ventor assignment (`customer-whatsapp-flow-completed.service`)

1. `GET {OFFICE_BACK_INTERNAL_BASE_URL}/rest/internal/ventors/physical-assignment-candidates` with header `X-Internal-Key`.
2. Filter ventors: `level = ventor (4)`, `physical = true`, `enable = true` (office_back).
3. Count customers per ventor: `assignedTo` + `assignedDate` in **[today−28d 00:00:00, now]** (ISO strings).
4. `console.log` `{ windowStart, windowEnd, timeZone, countsByVentorId }`.
5. Pick minimum count; tie-break by lexicographic ventor id.
6. Set `assignedTo`, `assignedDate`, `whatsappPotentialCustomerStatus = 'ready_for_llm'`, save (audit via hooks).

### API / stats

- `GET /customers-rest/customer/mine/stats` — added **`customersAssignedLast28Days`** (same window as assignment).

### Copy / utils

- `constants/ventor-assignment-message.constant.ts`
- `utils/format-ventor-assignment-message.util.ts`

### Env (customers-ms)

| Variable | Purpose |
|----------|---------|
| `CUSTOMERS_META_INGEST_ACTOR_ID` | `createdBy` for Meta-created customers (default `meta-gateway-ingest`) |
| `OFFICE_BACK_INTERNAL_BASE_URL` or `OMEGA_OFFICE_BACK_URL` | Monolith base URL |
| `OFFICE_BACK_INTERNAL_API_KEY` | Must match office_back |
| `VENTOR_ASSIGNMENT_TZ` | Logged (default `America/Bogota`) |
| `RABBITMQ_URL` / `RABBIT_MQ_*` | Required for RMQ consumers + `WS_MS_QUEUE` emit |

---

## whatsapp_cloud_ms

### Inbound from customers-ms

| Pattern | Queue | Handler |
|---------|-------|---------|
| `potential_customers.ms_ws` | `ws_ms_queue` | `PotentialCustomersMsEventsController` + `PotentialCustomersMsEventsService` |

**Actions:**

- `send.potential_customer_template` → `WhatsappCloudService.sendTemplatePotentialCustomer` (`potential_customer`, `es`)
- `send.potential_customer_text` → `sendTextMessage` (ventor assignment notice)

**Module:** `src/potential-customers/potential-customers.module.ts` (imported in `app.module.ts`).

**Not used for this funnel:** `WhatsappOnboardingEventsController` / `ms_ws_cloud` (onboarding / monolith).

### Flow completion → customers-ms

`WhatsappCloudController` webhook: on `interactive.type === 'nfm_reply'`, emit **`customers.whatsapp.flow.completed.v1`** to `crm.customers.whatsapp_integration` (`CUSTOMERS_MS_INTEGRATION` client).

### LLM gate

Before `maybeSendDeepSeekLotesReply`: RPC **`customers.whatsapp.customer.lookup.v1`** (`send` to customers-ms). LLM only if `found === true`.

### Constants

- `src/constants/app-constants.ts` — `VENTOR_ASSIGNMENT_CUSTOMER_MESSAGE_TEMPLATE` (placeholders `[user_name]`, `[user_phone]`)

---

## omega_office_back

| Route | Auth | Returns |
|-------|------|---------|
| `GET /rest/internal/ventors/physical-assignment-candidates` | Header `X-Internal-Key` = `OFFICE_BACK_INTERNAL_API_KEY` | `{ ventors: [{ id, name, lastName, phone, phoneJob }] }` |

**Files:** `features/internal-ventors/`, `UsersService.getPhysicalVentorsForCrmAssignment()`.

---

## Debugging

1. **Gateway:** log `Forwarding customers webhook to crm-omega-customers-ms` / Meta path.
2. **customers-ms:** `CustomerMetaWebhookService` logs — start, per-message, create vs existing, upsert, `shouldSendTemplate`, emit.
3. **customers-ms outbound:** warn if `rabbitmq.url` empty (template skipped).
4. **whatsapp_ms:** `PotentialCustomersMsEventsService` + template send logs in `WhatsappCloudService`.
5. **Flow:** whatsapp_ms emit `customers.whatsapp.flow.completed.v1` → customers-ms ventor `console.log` counts.

Set Nest **`LOG_LEVEL=debug`** for verbose ingress payload in `CustomerMetaWebhookRmqController`.

---

## Meta / product checklist

- [ ] Template **`potential_customer`** approved in Business Manager (`es`); body param **`contact_name`** if using name in template (adjust in `sendTemplatePotentialCustomer` if different).
- [ ] WhatsApp Flow field keys aligned with `customer-whatsapp-flow-completed.service` mapper (`full_name`, `email`, `document`, etc.).
- [ ] Meta webhook URL points to gateway **`/webhooks/customers`** (or `/webhooks/meta`) for the **exclusive** WABA.
- [ ] `WHATSAPP_CLOUD_PHONE_NUMBER_ID` in whatsapp_ms matches webhook `phone_number_id`.
- [ ] RabbitMQ: `crm.customers.whatsapp_integration` + `ws_ms_queue` running; customers-ms + whatsapp_ms connected.

---

## Related files (quick index)

```
omega_gateway/
  src/webhook/webhook.service.ts
  src/webhook/webhook.controller.ts

crm-omega-customers-ms/
  src/customer/customer-meta-webhook*.ts
  src/customer/customer-whatsapp-flow-completed*.ts
  src/customer/customer-potential-customers-outbound.service.ts
  src/customer/schemas/customer.schema.ts
  src/customer-conversations/schemas/customer-whatsapp-chat.schema.ts

whatsapp_cloud_ms/
  src/potential-customers/*
  src/whatsapp-cloud/whatsapp-cloud.service.ts (sendTemplatePotentialCustomer)
  src/whatsapp-cloud/whatsapp-cloud.controller.ts (nfm_reply, LLM gate)

omega_office_back/
  src/features/internal-ventors/*
  src/features/users/users.service.ts (getPhysicalVentorsForCrmAssignment)
```
