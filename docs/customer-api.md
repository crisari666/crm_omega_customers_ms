# Customer HTTP API

Base URL defaults to `http://localhost:3000` (see `src/main.ts`). All JSON bodies must use `Content-Type: application/json`.

The app runs a global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`: unknown properties in the body are rejected with **400 Bad Request**.

---

## Health

### `GET /customer/test`

Smoke check for the customer module.

**Example**

```bash
curl -sS http://localhost:3000/customer/test
```

**Response** (`200`)

```json
{ "status": "ok" }
```

---

## Create customer

### `POST /customer`

Creates a customer document in MongoDB.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | |
| `lastName` | string | yes | |
| `phone` | string | yes | |
| `whatsapp` | string | no | |
| `email` | string | no | Valid email when present |
| `documentType` | string | no | `cc` or `passport` |
| `document` | string | no | |
| `interestedProjects` | array | no | Items: `{ "projectId": string, "date"?: ISO-8601 string }`. If `date` is omitted, server uses current time |
| `description` | string[] | no | Short text lines stored on the customer |
| `assignedTo` | string | no | User or agent id (opaque string) |
| `createdBy` | string | yes | User id who created the record |

**Example**

```bash
curl -sS -X POST http://localhost:3000/customer \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Ada",
    "lastName": "Lovelace",
    "phone": "+573001234567",
    "whatsapp": "+573001234567",
    "email": "ada@example.com",
    "documentType": "cc",
    "document": "123456789",
    "interestedProjects": [
      { "projectId": "proj_001", "date": "2026-04-18T12:00:00.000Z" }
    ],
    "description": ["Met at fair", "Wants 2BR"],
    "assignedTo": "user_sales_01",
    "createdBy": "user_admin_01"
  }'
```

**Response** (`201` from Nest default for POST returning body — here returns the saved document)

The body matches the `Customer` schema plus Mongo fields: `_id`, `createdAt`, `updatedAt`, `__v`.

---

## Update customer

### `PATCH /customer/:customerId`

Partial update. `:customerId` is the MongoDB `_id` string.

Same fields as create, all optional. Omitted fields are left unchanged. Sending `interestedProjects` replaces the entire array on the customer.

**Example**

```bash
curl -sS -X PATCH "http://localhost:3000/customer/REPLACE_WITH_CUSTOMER_ID" \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "ada.new@example.com",
    "assignedTo": "user_sales_02"
  }'
```

**Responses**

- `200` — updated customer document
- `404` — customer not found

---

## Add description (audit log)

### `POST /customer/:customerId/descriptions`

Appends a row in the `customer_descriptions` collection (`CustomerDescription` schema: `customerId`, `user`, `date`, `description`).

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `user` | string | yes | Who wrote the note |
| `description` | string | yes | Text |
| `date` | string | no | ISO-8601; defaults to now |

**Example**

```bash
curl -sS -X POST "http://localhost:3000/customer/REPLACE_WITH_CUSTOMER_ID/descriptions" \
  -H 'Content-Type: application/json' \
  -d '{
    "user": "user_sales_01",
    "description": "Called back; prefers morning visits.",
    "date": "2026-04-18T15:30:00.000Z"
  }'
```

**Response** (`201`)

Saved description document, including `_id` and `customerId`.

**Errors**

- `404` — customer not found

---

## Link interested project

### `POST /customer/:customerId/projects`

Pushes one entry into the customer’s `interestedProjects` array (`projectId` + `date`).

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `projectId` | string | yes | External project identifier |
| `date` | string | no | ISO-8601; defaults to now |

**Example**

```bash
curl -sS -X POST "http://localhost:3000/customer/REPLACE_WITH_CUSTOMER_ID/projects" \
  -H 'Content-Type: application/json' \
  -d '{
    "projectId": "proj_042",
    "date": "2026-04-20T10:00:00.000Z"
  }'
```

**Response** (`200`)

Full updated customer document (including the new item in `interestedProjects`).

**Errors**

- `404` — customer not found

---

## Quick reference

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/customer/test` | Health |
| `POST` | `/customer` | Create customer |
| `PATCH` | `/customer/:customerId` | Update customer |
| `POST` | `/customer/:customerId/descriptions` | Add structured description |
| `POST` | `/customer/:customerId/projects` | Add interested project |

---

## Validation errors

Invalid body (wrong types, unknown keys, bad email, invalid `documentType`, etc.) returns **400** with Nest’s default validation error payload (`message`, `error`, `statusCode`).

Replace `REPLACE_WITH_CUSTOMER_ID` with the `_id` returned from the create call (24-character hex string in MongoDB’s default id format).
