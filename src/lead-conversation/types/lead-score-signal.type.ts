/** Signals that add points to the V2 lead score. */
export type LeadScoreSignal =
  | 'motivation_known'
  | 'payment_known'
  | 'timeline_soon'
  | 'timeline_later'
  | 'budget_known'
  | 'high_intent_question'
  | 'accepted_call'
  | 'call_booked';
