# Ventor Meet audit (SA + Workspace Events)

## Credentials (no new env)

- SA JSON: `la-ceiba-34945-firebase-adminsdk-fbsvc-b8fe807f1d.json` (repo root)
- SA email: `firebase-adminsdk-fbsvc@la-ceiba-34945.iam.gserviceaccount.com`
- DWD audit invitee: `records@laceiba.group` (auto-accepts invite after Meet create)

## Workspace Admin — Domain-wide delegation

Authorize the SA client id with scopes:

- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/meetings.space.readonly`
- `https://www.googleapis.com/auth/meetings.space.created`

DWD can impersonate **any Workspace user** in the domain (ventors). Event create uses the signed-in ventor email as JWT `subject` so they are the Calendar/Meet organizer.

## Pub/Sub (Workspace Events)

1. Create topic from `IS_PROD`:
   - local (`IS_PROD=false`): `projects/la-ceiba-34945/topics/omega-meet-artifacts-dev`
   - prod (`IS_PROD=true`): `projects/la-ceiba-34945/topics/omega-meet-artifacts`
2. Push subscription → `POST {customers-ms}/customers-rest/webhooks/google-meet-events`
3. Enable Workspace Events API + Calendar + Meet APIs on project `la-ceiba-34945`

## Flow

1. Ventor creates virtual visit → backend creates Calendar Meet on **the ventor's primary calendar** (DWD as `ventorEmail` from signed-in referrals-boost user). Attendees: customer + `records@`. Backend then DWD-patches `records@` RSVP to `accepted` (full attendees list, `sendUpdates: none`) so recording/transcript Drive ACL applies.
2. Calendar `conferenceId` is a **meeting code**. Backend resolves it via `GET meet.googleapis.com/v2/spaces/{code}` (as the ventor) to the canonical Meet REST id before storing / subscribing.
3. If `scheduledAt` within 24h → subscribe as the organizer ventor with `targetResource=//meet.googleapis.com/spaces/{canonicalId}`; else cron hourly.
4. Webhook or manual refresh stores Drive file ids + transcript text (Meet API as `organizerEmail`).
