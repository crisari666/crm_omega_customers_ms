import type { LeadProfile } from '../../types/lead-profile.type';

type ProfileLabels<Key extends keyof LeadProfile> = Readonly<Record<NonNullable<LeadProfile[Key]> & string, string>>;

/** Spanish labels of the structured lead profile values (UI and advisor brief never show raw codes). */
export const LEAD_MOTIVATION_LABELS: ProfileLabels<'motivation'> = {
  build: 'Construir',
  invest: 'Invertir',
  leisure: 'Recreación',
  exploring: 'Explorando opciones',
};

export const LEAD_EXPERIENCE_LABELS: ProfileLabels<'experience'> = {
  first_property: 'Primera propiedad',
  has_property: 'Ya tiene propiedad',
};

export const LEAD_PAYMENT_LABELS: ProfileLabels<'paymentMethod'> = {
  financed: 'Financiado',
  cash: 'De contado',
};

export const LEAD_TIMELINE_LABELS: ProfileLabels<'timeline'> = {
  within_3_months: 'En los próximos 3 meses',
  later: 'Más adelante',
};

export const LEAD_TEMPERATURE_LABELS: Readonly<Record<'hot' | 'warm' | 'cold', string>> = {
  hot: 'Caliente',
  warm: 'Tibio',
  cold: 'Frío',
};

export const LEAD_STAGE_LABELS: Readonly<Record<NonNullable<LeadProfile['stage']>, string>> = {
  opening: 'Apertura',
  discovery: 'Descubrimiento',
  value: 'Propuesta de valor',
  bridge: 'Puente a llamada',
  booking: 'Agendando llamada',
  booked: 'Llamada agendada',
};
