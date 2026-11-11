/** Default Laceiba Meet-audit invitee when `MEET_AUDIT_SUBJECT_EMAIL` is unset. */
const MEET_AUDIT_SUBJECT_EMAIL_DEFAULT = 'records@laceiba.group' as const;

/** Default Laceiba SA JSON at repo root when `MEET_AUDIT_SA_RELATIVE_PATH` is unset. */
const MEET_AUDIT_SA_RELATIVE_PATH_DEFAULT =
  'la-ceiba-34945-firebase-adminsdk-fbsvc-b8fe807f1d.json' as const;

/**
 * Workspace user invited to every ventor Meet (auto-accept for recording ACL).
 * Override per tenant with `MEET_AUDIT_SUBJECT_EMAIL` (e.g. records@gtower.cloud).
 */
export function resolveMeetAuditSubjectEmail(): string {
  const fromEnv = (process.env.MEET_AUDIT_SUBJECT_EMAIL ?? '').trim();
  return fromEnv || MEET_AUDIT_SUBJECT_EMAIL_DEFAULT;
}

/**
 * Repo-relative (or absolute) path to Meet-audit SA JSON for Calendar / Meet / Workspace Events JWT.
 * Override per tenant with `MEET_AUDIT_SA_RELATIVE_PATH` (e.g. gtower-app-cfa3750527b7.json).
 */
export function resolveMeetAuditSaRelativePath(): string {
  const fromEnv = (process.env.MEET_AUDIT_SA_RELATIVE_PATH ?? '').trim();
  return fromEnv || MEET_AUDIT_SA_RELATIVE_PATH_DEFAULT;
}

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
 * Override with full topic resource name via `MEET_AUDIT_PUBSUB_TOPIC`.
 * Otherwise uses `MEET_AUDIT_GCP_PROJECT` (default la-ceiba-34945) + omega-meet-artifacts(-dev).
 */
const MEET_AUDIT_PUBSUB_TOPIC_NAME = 'omega-meet-artifacts' as const;

/**
 * Returns the Workspace Events Pub/Sub topic for the current process env.
 */
export function resolveMeetAuditPubsubTopic(): string {
  const fromEnv = (process.env.MEET_AUDIT_PUBSUB_TOPIC ?? '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  const gcpProject =
    (process.env.MEET_AUDIT_GCP_PROJECT ?? '').trim() || 'la-ceiba-34945';
  const base = `projects/${gcpProject}/topics/${MEET_AUDIT_PUBSUB_TOPIC_NAME}`;
  const isMeetAuditProd: boolean =
    (process.env.IS_PROD ?? '').trim().toLowerCase() === 'true';
  return isMeetAuditProd ? base : `${base}-dev`;
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
