# Firebase Admin (assignment push / FCM)

Set `FIREBASE_ADMIN_CREDENTIALS` to the absolute path of the La Ceiba Firebase Admin SDK JSON (`la-ceiba-34945-*.json`). Do not commit the file; it is gitignored via `*-firebase-adminsdk-*.json`.

| Variable | Service | Purpose |
|----------|---------|---------|
| `FIREBASE_ADMIN_CREDENTIALS` | customers-ms + office_back | Path to la-ceiba service account JSON |
| `CRM_BACKEND_URL` | customers-ms | Monolith base including `/rest/` (token lookup) |
| `OFFICE_BACK_INTERNAL_API_KEY` | both | Shared key for `X-Internal-Key` |

Internal routes (office_back):

- `POST /rest/internal/users/fcm-tokens` body `{ userIds: string[] }` → `{ tokens: Record<string, string \| null> }`
- `GET /rest/internal/users/:userId/fcm-token` → `{ userId, fcmToken }`

Ventor app registers tokens with `PATCH /rest/users/fcm-token` body `{ token }` after login.
