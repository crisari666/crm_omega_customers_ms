# Ventor Meet audit (SA + Workspace Events)

## Env (per tenant)

| Var | Purpose | Laceiba default if unset |
|-----|---------|--------------------------|
| `MEET_AUDIT_SUBJECT_EMAIL` | Audit invitee (auto-accept) | `records@laceiba.group` |
| `MEET_AUDIT_SA_RELATIVE_PATH` | SA JSON path (cwd-relative or absolute) | `la-ceiba-34945-firebase-adminsdk-fbsvc-b8fe807f1d.json` |
| `MEET_AUDIT_GCP_PROJECT` | Pub/Sub project id | `la-ceiba-34945` |
| `MEET_AUDIT_PUBSUB_TOPIC` | Full topic resource (overrides project + name) | — |
| `GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` | Optional SA fallback if JSON missing | — |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional absolute/relative SA JSON fallback | — |

### GTower example

```bash
MEET_AUDIT_SUBJECT_EMAIL=records@gtower.cloud
MEET_AUDIT_SA_RELATIVE_PATH=gtower-app-cfa3750527b7.json
MEET_AUDIT_GCP_PROJECT=gtower-app
GOOGLE_CLIENT_EMAIL=meet-audit@gtower-app.iam.gserviceaccount.com
GOOGLE_APPLICATION_CREDENTIALS=./gtower-app-cfa3750527b7.json
```

## Workspace Admin — Domain-wide delegation

Authorize the SA client id with scopes:

- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/meetings.space.readonly`
- `https://www.googleapis.com/auth/meetings.space.created`
- `https://www.googleapis.com/auth/drive.readonly`

DWD can impersonate **any Workspace user** in the domain (ventors). Event create uses the signed-in ventor email as JWT `subject` so they are the Calendar/Meet organizer.

## Pub/Sub (Workspace Events)

1. Create topic from `IS_PROD` + `MEET_AUDIT_GCP_PROJECT` (or set `MEET_AUDIT_PUBSUB_TOPIC`):
   - non-prod: `projects/<project>/topics/omega-meet-artifacts-dev`
   - prod (`IS_PROD=true`): `projects/<project>/topics/omega-meet-artifacts`
2. Push subscription → `POST {customers-ms}/customers-rest/webhooks/google-meet-events`
3. Enable Workspace Events API + Calendar + Meet + Drive APIs on the GCP project

## Flow

1. Ventor creates virtual visit → backend creates Calendar Meet on **the ventor's primary calendar** (DWD as `ventorEmail`). Attendees: customer + audit subject email. Backend finds the invite on the audit calendar via `iCalUID` and patches RSVP to `accepted` (`sendUpdates: none`).
2. Calendar `conferenceId` is a **meeting code**. Backend resolves it via Meet API to the canonical Meet REST id before storing / subscribing.
3. If `scheduledAt` within 24h → subscribe as the organizer ventor; else cron hourly.
4. Webhook or manual refresh stores Drive file ids + transcript text.
