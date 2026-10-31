/**
 * Whether a customer should appear on the ventor mine list for the given window.
 * Prospects are always included.
 */
export function isWithinVentorMineWindow(input: {
  readonly isProspect?: boolean;
  readonly effectiveDate: Date;
  readonly windowDays: number;
  readonly now?: Date;
}): boolean {
  if (input.isProspect === true) {
    return true;
  }
  const now = input.now ?? new Date();
  const cutoffMs =
    now.getTime() - input.windowDays * 24 * 60 * 60 * 1000;
  return input.effectiveDate.getTime() >= cutoffMs;
}
