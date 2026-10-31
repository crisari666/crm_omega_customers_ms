/** Default rolling window for `GET customer/mine` when the step omits days. */
export const DEFAULT_VENTOR_MINE_VISIBILITY_DAYS = 30;

/**
 * Resolves how many days a customer stays on the ventor mine list.
 * Uses the step value when it is a finite integer ≥ 1; otherwise the default.
 */
export function resolveVentorMineVisibilityDays(
  stepVisibilityDays?: number | null,
): number {
  if (
    typeof stepVisibilityDays === 'number' &&
    Number.isFinite(stepVisibilityDays) &&
    stepVisibilityDays >= 1
  ) {
    return Math.floor(stepVisibilityDays);
  }
  return DEFAULT_VENTOR_MINE_VISIBILITY_DAYS;
}
