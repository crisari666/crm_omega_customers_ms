import type { LeadProfile } from '../../types/lead-profile.type';

/** Validated JSON answer of the V2 agent LLM for one customer turn. */
export type LeadAgentLlmTurn = {
  readonly replies: readonly string[];
  readonly profile: Partial<
    Pick<
      LeadProfile,
      'motivation' | 'experience' | 'paymentMethod' | 'timeline' | 'budget' | 'lotPreference' | 'mainObjection'
    >
  >;
  readonly intents: readonly (
    | 'asked_price'
    | 'asked_financing'
    | 'asked_availability'
    | 'asked_separation'
    | 'asked_visit'
    | 'asked_location'
    | 'asked_legal'
    | 'wants_call'
    | 'not_interested'
    | 'stop'
  )[];
  readonly action: 'continue' | 'send_media' | 'offer_call_slots' | 'offer_projects' | 'opt_out';
  readonly media: readonly ('video' | 'plan' | 'brochure')[];
  readonly callPeriod: 'morning' | 'afternoon' | 'night' | null;
  readonly projectId: string | null;
  readonly usedFaqIds: readonly string[];
  readonly unansweredQuestion: string | null;
};
