# Customer HTTP API

Base URL: `http://localhost:{APP_PORT}` (default **`4001`**, see `src/main.ts`) plus global prefix **`customers-rest`**. Example root: `http://localhost:4001/customers-rest`. Paths below are shown after that prefix (e.g. full path for health is `GET /customers-rest/customer/test`). All JSON bodies must use `Content-Type: application/json`.

The app runs a global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`: unknown properties in the body are rejected with **400 Bad Request**.

---

## Consuming the API

Build the base URL from host, port, and global prefix:

| Piece | Example |
| --- | --- |
| Host | `http://localhost` (or your deployed host) |
| Port | `4001` unless `APP_PORT` overrides (`src/main.ts`) |
| Global prefix | `customers-rest` |
| Module path | `/customer/...` |

**Full URL pattern**

`{origin}/customers-rest/customer{path}`

Examples: `.../customers-rest/customer/test`, `.../customers-rest/customer/mine`, `.../customers-rest/customer/<mongoId>`.

**Headers (protected routes)**

- `TOKEN: <office JWT>` — required on every route below except `GET /customer/test`. Optional `Bearer ` prefix before the JWT (server strips it).
- `Content-Type: application/json` — required for `POST` / `PATCH` bodies.

**JavaScript (`fetch`)**

```javascript
const BASE = 'http://localhost:4001/customers-rest';
const token = '<office-jwt>'; // same value you send as TOKEN header

// List customers where createdBy = JWT user
const mine = await fetch(`${BASE}/customer/mine`, {
  headers: { TOKEN: token },
}).then((r) => r.json());

// Get one customer by Mongo _id
const customerId = '507f1f77bcf86cd799439011';
const one = await fetch(`${BASE}/customer/${customerId}`, {
  headers: { TOKEN: token },
}).then((r) => {
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
});

// Create customer (createdBy comes from JWT, not body)
const created = await fetch(`${BASE}/customer`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    TOKEN: token,
  },
  body: JSON.stringify({
    name: 'Ada',
    lastName: 'Lovelace',
    phone: '+573001234567',
  }),
}).then((r) => r.json());
```

From a browser, ensure CORS allows your origin; send the `TOKEN` header on cross-origin requests (this app enables CORS with `origin: true` in `src/main.ts`).

---

## Authentication (JWT)

All routes under `/customer` **except** `GET /customer/test` require a valid office JWT (RS256), including `GET /customer/mine`, `GET /customer/:customerId`, `POST /customer`, `PATCH /customer/:customerId`, and the `POST` routes under `:customerId`.

- Send the token in the **`TOKEN`** HTTP header (same as omega_rag). Optional `Bearer ` prefix is stripped before verification.
- The service loads the public key from `{JWT_OFFICE_BASE_URL or CRM_BACKEND_URL}/public/jwt/public-key`. Set at least one of these environment variables (see omega office / CRM backend base URL).
- Invalid, missing, or expired tokens respond with **401 Unauthorized** (`TOKEN header is required`, `Invalid token`, `Token has expired`, etc.).

**Example header**

```http
TOKEN: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

`curl` with a token:

```bash
curl -sS -X POST http://localhost:4001/customers-rest/customer \
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
curl -sS http://localhost:4001/customers-rest/customer/test
```

**Response** (`200`)

```json
{ "status": "ok" }
```

---

## List customers created by the authenticated user

### `GET /customer/mine`

Returns every customer whose `createdBy` field equals the current office user id from the JWT (`userId`, or `sub` if `userId` is absent)—same rule as `POST /customer`. No query parameters; user id is **not** taken from the body.

Requires **`TOKEN`** header (see [Authentication](#authentication-jwt)).

**Example**

```bash
curl -sS http://localhost:4001/customers-rest/customer/mine \
  -H "TOKEN: $OFFICE_JWT"
```

**Response** (`200`)

JSON array of customer documents (same shape as create response: `Customer` fields plus `_id`, `createdAt`, `updatedAt`, `__v`). Newest first (`createdAt` descending). Empty array if none match.

**Errors**

- `401` — missing/invalid JWT, or payload has no user id (`Missing JWT context`, `JWT payload has no user identifier`, etc.)

---

## Get customer by id

### `GET /customer/:customerId`

Returns a single customer document. `:customerId` is the MongoDB `_id` string (same as create/patch).

Requires **`TOKEN`** header (see [Authentication](#authentication-jwt)).

**Example**

```bash
curl -sS "http://localhost:4001/customers-rest/customer/REPLACE_WITH_CUSTOMER_ID" \
  -H "TOKEN: $OFFICE_JWT"
```

**Response** (`200`)

One customer object: `Customer` fields plus `_id`, `createdAt`, `updatedAt`, `__v`. The `description` array is **populated**: each item is the full `customer_descriptions` document (`customerId`, `user`, `date`, `description` text, `_id`), not bare ObjectIds.

**Errors**

- `401` — missing or invalid `TOKEN` / JWT
- `404` — no document with that id

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
| `assignedTo` | string | no | User or agent id (opaque string) |

The `createdBy` field on the stored customer is set from the JWT (`userId`, or `sub` if `userId` is absent), not from the JSON body. The customer’s `description` field (array of ObjectIds pointing at `customer_descriptions`) is **not** set on create or patch; it only grows when you call `POST /customer/:customerId/descriptions` (see below).

**Example**

```bash
curl -sS -X POST http://localhost:4001/customers-rest/customer \
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
    "assignedTo": "user_sales_01"
  }'
```

**Response** (`201` from Nest default for POST returning body — here returns the saved document)

The body matches the `Customer` schema plus Mongo fields: `_id`, `createdAt`, `updatedAt`, `__v`.

---

## Update customer

### `PATCH /customer/:customerId`

Partial update. `:customerId` is the MongoDB `_id` string.

Same fields as create (except `createdBy`, which is only set on create from the JWT), all optional. Omitted fields are left unchanged. Sending `interestedProjects` replaces the entire array on the customer. The `description` id list is not writable here; use `POST /customer/:customerId/descriptions` to append.

Requires **`TOKEN`** header (see [Authentication](#authentication-jwt)).

**Example**

```bash
curl -sS -X PATCH "http://localhost:4001/customers-rest/customer/REPLACE_WITH_CUSTOMER_ID" \
  -H 'Content-Type: application/json' \
  -H "TOKEN: $OFFICE_JWT" \
  -d '{
    "email": "ada.new@example.com",
    "assignedTo": "user_sales_02"
  }'
```

**Responses**

- `200` — updated customer document
- `401` — missing or invalid `TOKEN` / JWT
- `404` — customer not found

---

## Add description (audit log)

### `POST /customer/:customerId/descriptions`

Appends a row in the `customer_descriptions` collection (`CustomerDescription` schema: `customerId`, `user`, `date`, `description`). The `user` field is set from the JWT (`userId`, or `sub`), not from the body. The new document’s `_id` is **pushed** onto the parent customer’s `description` array (ObjectId refs).

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `description` | string | yes | Text |
| `date` | string | no | ISO-8601; defaults to now |

**Example**

```bash
curl -sS -X POST "http://localhost:4001/customers-rest/customer/REPLACE_WITH_CUSTOMER_ID/descriptions" \
  -H 'Content-Type: application/json' \
  -H "TOKEN: $OFFICE_JWT" \
  -d '{
    "description": "Called back; prefers morning visits.",
    "date": "2026-04-18T15:30:00.000Z"
  }'
```

**Response** (`201`)

Saved description document, including `_id` and `customerId`. The parent customer’s `description` array is updated in the same request (same `_id` appended).

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
curl -sS -X POST "http://localhost:4001/customers-rest/customer/REPLACE_WITH_CUSTOMER_ID/projects" \
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
| `GET` | `/customer/mine` | List customers where `createdBy` = JWT user (JWT) |
| `GET` | `/customer/:customerId` | Get one customer by Mongo `_id` (JWT) |
| `POST` | `/customer` | Create customer (JWT) |
| `PATCH` | `/customer/:customerId` | Update customer (JWT) |
| `POST` | `/customer/:customerId/descriptions` | Add structured description (JWT) |
| `POST` | `/customer/:customerId/projects` | Add interested project (JWT) |

---

## Validation errors

Invalid body (wrong types, unknown keys, bad email, invalid `documentType`, etc.) returns **400** with Nest’s default validation error payload (`message`, `error`, `statusCode`).

Replace `REPLACE_WITH_CUSTOMER_ID` with the `_id` returned from the create call (24-character hex string in MongoDB’s default id format).
