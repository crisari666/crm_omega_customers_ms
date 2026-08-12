/**
 * Allowed payment methods for customer payments / down-payment fees.
 */
export const CUSTOMER_PAYMENT_METHODS = [
  'Tarjeta de Credito',
  'Transferencia Bancaria',
  'Efectivo',
] as const;

export type CustomerPaymentMethod =
  (typeof CUSTOMER_PAYMENT_METHODS)[number];
