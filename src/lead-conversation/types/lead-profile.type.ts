export type LeadProfileStage = 'opening' | 'discovery' | 'value' | 'bridge' | 'booking' | 'booked';

/** Structured facts the V2 agent learned about the lead. */
export type LeadProfile = {
  readonly stage?: LeadProfileStage;
  readonly stageTurns?: number;
  readonly motivation?: 'build' | 'invest' | 'leisure' | 'exploring';
  readonly experience?: 'first_property' | 'has_property';
  readonly paymentMethod?: 'financed' | 'cash';
  readonly timeline?:
    | 'immediate'
    | 'within_30_days'
    | 'within_3_months'
    | 'future'
    | 'not_now';
  readonly budget?: string;
  readonly lotPreference?: string;
  readonly mainObjection?: string;
  readonly sentMedia?: readonly ('video' | 'plan' | 'brochure')[];
};
