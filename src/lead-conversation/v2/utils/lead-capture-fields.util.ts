import type { LeadProfile } from '../../types/lead-profile.type';

/** Stage-3 capture keys the V2 agent steers toward (order = ask priority after project). */
export const LEAD_CAPTURE_FIELD_PRIORITY = [
  'buyMotive',
  'paymentMethod',
  'timeToBuy',
  'urgencyLevel',
  'decisionMaker',
  'economicCapacity',
  'city',
] as const;

export type LeadCaptureFieldKey = (typeof LEAD_CAPTURE_FIELD_PRIORITY)[number];

export type LeadCaptureKnown = Partial<Record<LeadCaptureFieldKey | 'projectId', string>>;

/** Asked before the call is booked (payment only; motive comes from buttons). */
const PRE_BOOKING_CAPTURE_FIELDS: readonly LeadCaptureFieldKey[] = ['paymentMethod'];

/** Asked after the call is booked, one per turn. */
const POST_BOOKING_CAPTURE_FIELDS: readonly LeadCaptureFieldKey[] = [
  'timeToBuy',
  'urgencyLevel',
  'decisionMaker',
];

const isFilled = (value: string | undefined): boolean => (value ?? '').trim().length > 0;

/**
 * Maps V2 profile motivation onto Stage-3 buyMotive codes.
 * build/leisure → live; invest → invest; exploring stays unset for required buyMotive.
 */
export function mapMotivationToBuyMotive(
  motivation: LeadProfile['motivation'],
): string | undefined {
  if (motivation === 'build' || motivation === 'leisure') return 'live';
  if (motivation === 'invest') return 'invest';
  return undefined;
}

/** Maps profile payment onto Stage-3 paymentMethod codes. */
export function mapProfilePaymentToCapture(
  paymentMethod: LeadProfile['paymentMethod'],
): string | undefined {
  if (paymentMethod === 'cash') return 'cash';
  if (paymentMethod === 'financed') return 'financing';
  return undefined;
}

/** Infers urgencyLevel from timeToBuy when urgency was not answered explicitly. */
export function inferUrgencyFromTimeToBuy(timeToBuy: string | undefined): string | undefined {
  if (timeToBuy === 'immediate' || timeToBuy === 'within_30_days') return 'high';
  if (timeToBuy === 'within_3_months') return 'medium';
  if (timeToBuy === 'future' || timeToBuy === 'not_now') return 'low';
  return undefined;
}

/** Merges metadata values with profile-derived capture facts (metadata wins when set). */
export function buildCaptureKnown(args: {
  readonly metadataValues: Readonly<Record<string, string>>;
  readonly profile: LeadProfile;
  readonly projectId?: string;
}): LeadCaptureKnown {
  const { metadataValues, profile, projectId } = args;
  const buyMotive =
    metadataValues.buyMotive ?? mapMotivationToBuyMotive(profile.motivation);
  const timeToBuy = metadataValues.timeToBuy ?? profile.timeline;
  const paymentMethod =
    metadataValues.paymentMethod ?? mapProfilePaymentToCapture(profile.paymentMethod);
  const urgencyLevel =
    metadataValues.urgencyLevel ?? inferUrgencyFromTimeToBuy(timeToBuy);
  return {
    ...(isFilled(projectId ?? metadataValues.projectId)
      ? { projectId: (projectId ?? metadataValues.projectId)! }
      : {}),
    ...(isFilled(buyMotive) ? { buyMotive: buyMotive! } : {}),
    ...(isFilled(timeToBuy) ? { timeToBuy: timeToBuy! } : {}),
    ...(isFilled(paymentMethod) ? { paymentMethod: paymentMethod! } : {}),
    ...(isFilled(urgencyLevel) ? { urgencyLevel: urgencyLevel! } : {}),
    ...(isFilled(metadataValues.decisionMaker)
      ? { decisionMaker: metadataValues.decisionMaker }
      : {}),
    ...(isFilled(metadataValues.economicCapacity)
      ? { economicCapacity: metadataValues.economicCapacity }
      : {}),
    ...(isFilled(metadataValues.city) ? { city: metadataValues.city } : {}),
    ...(isFilled(profile.budget) && !isFilled(metadataValues.economicCapacity)
      ? {}
      : {}),
  };
}

/**
 * First missing capture field for the current phase.
 * Before booking: paymentMethod only. After booking: timeToBuy → urgency → decisionMaker.
 */
export function resolveNextCaptureField(
  known: LeadCaptureKnown,
  isBooked = false,
): LeadCaptureFieldKey | undefined {
  const phase = isBooked ? POST_BOOKING_CAPTURE_FIELDS : PRE_BOOKING_CAPTURE_FIELDS;
  for (const key of phase) {
    if (!isFilled(known[key])) return key;
  }
  return undefined;
}

export function listMissingCaptureFields(
  known: LeadCaptureKnown,
  isBooked = false,
): LeadCaptureFieldKey[] {
  const phase = isBooked ? POST_BOOKING_CAPTURE_FIELDS : PRE_BOOKING_CAPTURE_FIELDS;
  return phase.filter((key) => !isFilled(known[key]));
}
