/** Hardcoded Meet audit constants — no new env vars for credentials/subject. */
export const MEET_AUDIT_SUBJECT_EMAIL = 'records@laceiba.group' as const;

/** Repo-root Firebase SA JSON used for Calendar / Meet / Workspace Events JWT. */
export const MEET_AUDIT_SA_RELATIVE_PATH =
  'la-ceiba-34945-firebase-adminsdk-fbsvc-b8fe807f1d.json' as const;

export const MEET_AUDIT_CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar' as const;

export const MEET_AUDIT_MEETINGS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/meetings.space.readonly' as const;

/** Workspace Events API also needs meetings.space.created for some subscription ops. */
export const MEET_AUDIT_MEETINGS_SPACE_CREATED_SCOPE =
  'https://www.googleapis.com/auth/meetings.space.created' as const;

export const MEET_AUDIT_TIME_ZONE = 'America/Bogota' as const;

export const MEET_AUDIT_DEFAULT_DURATION_MS = 30 * 60 * 1000;

/** Meet Workspace Events subscriptions expire after at most 24h. */
export const MEET_AUDIT_SUBSCRIPTION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cloud Pub/Sub topic for Workspace Events (project matches SA JSON).
 * Ops must create this topic + push subscription to customers-ms webhook.
 * Resolved at call time so Nest `ConfigModule` / `.env` `IS_PROD` is available.
 * Local / non-prod (`IS_PROD` not `true`) uses the `-dev` suffix.
 */
const MEET_AUDIT_PUBSUB_TOPIC_BASE =
  'projects/la-ceiba-34945/topics/omega-meet-artifacts' as const;

/**
 * Returns the Workspace Events Pub/Sub topic for the current process env.
 */
export function resolveMeetAuditPubsubTopic(): string {
  const isMeetAuditProd: boolean =
    (process.env.IS_PROD ?? '').trim().toLowerCase() === 'true';
  return isMeetAuditProd
    ? MEET_AUDIT_PUBSUB_TOPIC_BASE
    : `${MEET_AUDIT_PUBSUB_TOPIC_BASE}-dev`;
}

export const MEET_AUDIT_EVENT_TYPES = [
  'google.workspace.meet.transcript.v2.fileGenerated',
  'google.workspace.meet.recording.v2.fileGenerated',
] as const;

export enum MeetSubscriptionStatus {
  None = 'none',
  Pending = 'pending',
  Active = 'active',
  Expired = 'expired',
  Failed = 'failed',
}
