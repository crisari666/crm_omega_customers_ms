/** Formats a COP amount as `$51.000.000` (dot thousands separator, no decimals). */
export function formatCop(amount: number): string {
  const rounded = Math.round(amount).toString();
  return `$${rounded.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
