export const LEAD_PRICE_POLICIES = ['entry_ticket_first', 'full_price', 'defer_to_advisor'] as const;

/** How the assistant talks about prices. */
export type LeadPricePolicy = (typeof LEAD_PRICE_POLICIES)[number];
