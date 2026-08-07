# Firebase Admin (assignment push / FCM)

Set `FIREBASE_ADMIN_CREDENTIALS` to the absolute path of the La Ceiba Firebase Admin SDK JSON (`la-ceiba-34945-*.json`). Do not commit the file; it is gitignored via `*-firebase-adminsdk-*.json`.

| Variable | Service | Purpose |
|----------|---------|---------|
| `FIREBASE_ADMIN_CREDENTIALS` | customers-ms + office_back | Path to la-ceiba service account JSON |
| `CRM_BACKEND_URL` | customers-ms | Monolith base including `/rest/` (token lookup) |
| `OFFICE_BACK_INTERNAL_API_KEY` | both | Shared key for `X-Internal-Key` |
| `AGENT_WEB_APP_BASE_URL` | customers-ms | Agent web origin (e.g. `https://agent.laceiba.group`) for FCM `webpush.fcmOptions.link` → `/clients/{id}` |

Internal routes (office_back):

- `POST /rest/internal/users/fcm-tokens` body `{ userIds: string[] }` → `{ tokens: Record<string, string[]> }`
- `GET /rest/internal/users/:userId/fcm-token` → `{ userId, fcmToken, fcmTokens }`

Clients register with `PATCH /rest/users/fcm-token` body `{ token, platform?: "web"|"android"|"ios"|"unknown" }` (upsert into `fcmTokens[]`). Assignment push sends to every token for each recipient; per-token errors are logged and do not block other devices. Payload includes `type=customer_assignment`, `customerId`, and `route=/clients/{customerId}` so the ventor app opens customer detail on tap.
