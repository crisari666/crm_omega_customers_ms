# Customer HTTP API

Base URL defaults to `http://localhost:3000` (see `src/main.ts`). All JSON bodies must use `Content-Type: application/json`.

The app runs a global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`: unknown properties in the body are rejected with **400 Bad Request**.

---

## Authentication (JWT)

All routes under `/customer` **except** `GET /customer/test` require a valid office JWT (RS256).

- Send the token in the **`TOKEN`** HTTP header (same as omega_rag). Optional `Bearer ` prefix is stripped before verification.
- The service loads the public key from `{JWT_OFFICE_BASE_URL or CRM_BACKEND_URL}/public/jwt/public-key`. Set at least one of these environment variables (see omega office / CRM backend base URL).
- Invalid, missing, or expired tokens respond with **401 Unauthorized** (`TOKEN header is required`, `Invalid token`, `Token has expired`, etc.).

**Example header**

```http
TOKEN: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

`curl` with a token:

```bash
curl -sS -X POST http://localhost:3000/customer \
  -H 'Content-Type: application/json' \
  -H "TOKEN: $OFFICE_JWT" \
  -d '{"name":"Ada","lastName":"Lovelace","phone":"+573001234567"}'
```

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
| `interestedProjects` | array | no | Items: `{ "projectId": string, "date"?: ISO-8601 string }`. If `date` is omitted, server uses current time. Each stored item includes `addedBy` from the JWT (`userId` or `sub`) |
| `description` | string[] | no | Short text lines stored on the customer |
| `assignedTo` | string | no | User or agent id (opaque string) |

The `createdBy` field on the stored customer is set from the JWT (`userId`, or `sub` if `userId` is absent), not from the JSON body.

**Example**

```bash
curl -sS -X POST http://localhost:3000/customer \
  -H 'Content-Type: application/json' \
  -H "TOKEN: $OFFICE_JWT" \
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
    "assignedTo": "user_sales_01"
  }'
```

**Response** (`201` from Nest default for POST returning body — here returns the saved document)

The body matches the `Customer` schema plus Mongo fields: `_id`, `createdAt`, `updatedAt`, `__v`.

---

## Update customer

### `PATCH /customer/:customerId`

Partial update. `:customerId` is the MongoDB `_id` string.

Same fields as create (except `createdBy`, which is only set on create from the JWT), all optional. Omitted fields are left unchanged. Sending `interestedProjects` replaces the entire array on the customer.

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

Appends a row in the `customer_descriptions` collection (`CustomerDescription` schema: `customerId`, `user`, `date`, `description`). The `user` field is set from the JWT (`userId`, or `sub`), not from the body.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `description` | string | yes | Text |
| `date` | string | no | ISO-8601; defaults to now |

**Example**

```bash
curl -sS -X POST "http://localhost:3000/customer/REPLACE_WITH_CUSTOMER_ID/descriptions" \
  -H 'Content-Type: application/json' \
  -H "TOKEN: $OFFICE_JWT" \
  -d '{
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

Pushes one entry into the customer’s `interestedProjects` array (`projectId`, `date`, `addedBy`). The `addedBy` field is set from the JWT (`userId`, or `sub`), not from the body.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `projectId` | string | yes | External project identifier |
| `date` | string | no | ISO-8601; defaults to now |

**Example**

```bash
curl -sS -X POST "http://localhost:3000/customer/REPLACE_WITH_CUSTOMER_ID/projects" \
  -H 'Content-Type: application/json' \
  -H "TOKEN: $OFFICE_JWT" \
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
| `GET` | `/customer/test` | Health (no JWT) |
| `POST` | `/customer` | Create customer (JWT) |
| `PATCH` | `/customer/:customerId` | Update customer (JWT) |
| `POST` | `/customer/:customerId/descriptions` | Add structured description (JWT) |
| `POST` | `/customer/:customerId/projects` | Add interested project (JWT) |

---

## Validation errors

Invalid body (wrong types, unknown keys, bad email, invalid `documentType`, etc.) returns **400** with Nest’s default validation error payload (`message`, `error`, `statusCode`).

Replace `REPLACE_WITH_CUSTOMER_ID` with the `_id` returned from the create call (24-character hex string in MongoDB’s default id format).
