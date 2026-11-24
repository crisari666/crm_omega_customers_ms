import {
  LEAD_EXPERIENCE_LABELS,
  LEAD_MOTIVATION_LABELS,
  LEAD_PAYMENT_LABELS,
  LEAD_TIMELINE_LABELS,
} from '../constants/lead-agent-profile-labels.constants';
import type { LeadAgentBriefInput } from '../types/lead-agent-brief-input.type';

const EMPTY_BRIEF = 'Lead agendó una llamada; aún no compartió más detalles en la conversación.' as const;

/** Spanish advisor brief written straight from the lead profile (used when the LLM brief fails). */
export function buildLeadAgentBriefFallback(input: LeadAgentBriefInput): string {
  const { profile } = input;
  const facts: (string | null)[] = [
    input.projectTitle ? `Interesado en ${input.projectTitle}` : null,
    profile.motivation ? `Motivación: ${LEAD_MOTIVATION_LABELS[profile.motivation]}` : null,
    profile.experience ? `Experiencia: ${LEAD_EXPERIENCE_LABELS[profile.experience]}` : null,
    profile.paymentMethod ? `Forma de pago: ${LEAD_PAYMENT_LABELS[profile.paymentMethod]}` : null,
    profile.timeline ? `Plazo: ${LEAD_TIMELINE_LABELS[profile.timeline]}` : null,
    profile.budget ? `Presupuesto: ${profile.budget}` : null,
    profile.lotPreference ? `Preferencia de lote: ${profile.lotPreference}` : null,
    profile.mainObjection ? `Objeción principal: ${profile.mainObjection}` : null,
  ];
  const lines = facts.filter((fact): fact is string => fact !== null);
  return lines.length > 0 ? `${lines.join('. ')}.` : EMPTY_BRIEF;
}
