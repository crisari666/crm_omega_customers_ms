export const LEAD_CALL_PERIODS = ['morning', 'afternoon', 'night'] as const;

/** Call window the customer picks: morning 9–12, afternoon 14–17, night 18–21 (America/Bogota). */
export type LeadCallPeriod = (typeof LEAD_CALL_PERIODS)[number];
