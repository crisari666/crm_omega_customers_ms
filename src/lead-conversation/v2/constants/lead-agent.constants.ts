import type { LeadScoreSignal } from '../../types/lead-score-signal.type';
import type { LeadTemperature } from '../../types/lead-temperature.type';
import type { LeadAgentAction } from '../types/lead-agent-action.type';
import type { LeadAgentIntent } from '../types/lead-agent-intent.type';
import type { LeadAgentMediaKind } from '../types/lead-agent-media-kind.type';

/** Points each signal adds to the V2 score (`timeline_later` is ignored when `timeline_soon` is present). */
export const LEAD_SCORE_POINTS: Readonly<Record<LeadScoreSignal, number>> = {
  motivation_known: 10,
  payment_known: 10,
  timeline_soon: 20,
  timeline_later: 5,
  budget_known: 10,
  high_intent_question: 20,
  accepted_call: 10,
  call_booked: 20,
};

export const LEAD_HOT_MIN_SCORE = 60 as const;
export const LEAD_WARM_MIN_SCORE = 30 as const;
export const LEAD_PRIORITY_BY_TEMPERATURE: Readonly<Record<LeadTemperature, number>> = {
  hot: 3,
  warm: 2,
  cold: 1,
};

/** Spanish labels of the score segments, in display order. */
export const LEAD_SCORE_SEGMENT_LABELS = {
  motivation_known: 'Motivación',
  payment_known: 'Forma de pago',
  timeline: 'Plazo',
  budget_known: 'Presupuesto',
  high_intent_question: 'Pregunta de alta intención',
  accepted_call: 'Aceptó llamada',
  call_booked: 'Llamada agendada',
} as const;

/** Intents that show the customer is already thinking about buying. */
export const LEAD_HIGH_INTENT_INTENTS: readonly LeadAgentIntent[] = [
  'asked_financing',
  'asked_availability',
  'asked_separation',
  'asked_visit',
];

export const LEAD_AGENT_INTENTS: readonly LeadAgentIntent[] = [
  'asked_price',
  'asked_financing',
  'asked_availability',
  'asked_separation',
  'asked_visit',
  'asked_location',
  'asked_legal',
  'wants_call',
  'not_interested',
  'stop',
];
export const LEAD_AGENT_ACTIONS: readonly LeadAgentAction[] = [
  'continue',
  'send_media',
  'offer_call_slots',
  'offer_projects',
  'opt_out',
];
export const LEAD_AGENT_MEDIA_KINDS: readonly LeadAgentMediaKind[] = ['video', 'plan', 'brochure'];
export const LEAD_AGENT_MOTIVATIONS = ['build', 'invest', 'leisure', 'exploring'] as const;
export const LEAD_AGENT_EXPERIENCES = ['first_property', 'has_property'] as const;
export const LEAD_AGENT_PAYMENT_METHODS = ['financed', 'cash'] as const;
export const LEAD_AGENT_TIMELINES = ['within_3_months', 'later'] as const;
export const LEAD_AGENT_CALL_PERIODS = ['morning', 'afternoon', 'night'] as const;

export const LEAD_AGENT_MAX_REPLIES = 3 as const;
export const LEAD_AGENT_MAX_REPLY_CHARS = 600 as const;
export const LEAD_AGENT_MAX_PROFILE_TEXT_CHARS = 200 as const;
export const LEAD_AGENT_MAX_UNANSWERED_CHARS = 300 as const;
export const LEAD_AGENT_LLM_TEMPERATURE = 0.6 as const;
export const LEAD_AGENT_LLM_MAX_TOKENS = 700 as const;
export const LEAD_AGENT_BRIEF_TEMPERATURE = 0.3 as const;
export const LEAD_AGENT_BRIEF_MAX_TOKENS = 250 as const;
/** First attempt plus one retry. */
export const LEAD_AGENT_LLM_ATTEMPTS = 2 as const;

/** Turns spent in a stage (counting the current one) after which the stage advances anyway. */
export const LEAD_AGENT_DISCOVERY_MAX_TURNS = 4 as const;
export const LEAD_AGENT_VALUE_MAX_TURNS = 2 as const;

export const LEAD_AGENT_PROJECT_DESCRIPTION_MAX_CHARS = 1500 as const;
/** Cache lifetime of the public lot counts of a project. */
export const PROJECT_LOTS_TTL_MS = 5 * 60 * 1000;

export const LEAD_AGENT_FALLBACK_REPLY =
  'Gracias por escribirnos. Para darte la información exacta prefiero que te la confirme uno de nuestros asesores en una llamada corta.' as const;
export const LEAD_AGENT_FALLBACK_ASK_PROJECT_REPLY =
  'Para orientarte bien, ¿qué proyecto te interesa? Puedes decirme el nombre y te ayudo con eso.' as const;
export const LEAD_AGENT_FALLBACK_ASK_MOTIVATION_REPLY =
  'Para enviarte solo lo que te sirva: ¿lo estás mirando para construir, como inversión, o solo estás explorando?' as const;
export const LEAD_AGENT_FALLBACK_EXPLORING_REPLY =
  'Perfecto, sin compromiso. Cuando quieras te cuento más del proyecto o de las formas de pago; dime qué te gustaría saber.' as const;
export const LEAD_AGENT_OPT_OUT_REPLY =
  'Entendido, no te escribiremos más. Si más adelante quieres retomar, aquí estaremos.' as const;
export const LEAD_AGENT_LLM_CONTENT_LOG_CHARS = 200 as const;

export const LEAD_AGENT_SIMULATOR_DEFAULT_FIRST_NAME = 'Camila' as const;
export const LEAD_AGENT_SIMULATOR_MAX_MESSAGE_CHARS = 1000 as const;
