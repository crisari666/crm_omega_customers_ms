import {
  LEAD_EXPERIENCE_LABELS,
  LEAD_MOTIVATION_LABELS,
  LEAD_PAYMENT_LABELS,
  LEAD_TEMPERATURE_LABELS,
  LEAD_TIMELINE_LABELS,
} from '../constants/lead-agent-profile-labels.constants';
import type { LeadSessionSnapshot } from '../../lead-conversation-session.service';
import type { LeadConversationSummaryItem } from '../../types/lead-conversation-summary.type';
import type { LeadTemperature } from '../../types/lead-temperature.type';
import { formatCallSlotDate } from '../../utils/format-call-slot-date.util';

const item = (key: string, label: string, value: string | undefined): LeadConversationSummaryItem | null =>
  value ? { key, label, value } : null;

/** Summary rows of a V2 session; every value is shown in Spanish, never as an internal code. */
export function buildLeadAgentSummaryItems(session: LeadSessionSnapshot): LeadConversationSummaryItem[] {
  const profile = session.leadProfile ?? {};
  const answers = session.answers ?? {};
  const paymentMethod = profile.paymentMethod ?? answers.formaPago;
  const temperature = session.temperature as LeadTemperature | undefined;
  const items: (LeadConversationSummaryItem | null)[] = [
    item('project', 'Proyecto', session.isAllProjects ? 'Todos los proyectos' : session.projectTitle),
    item('motivation', 'Motivación', profile.motivation ? LEAD_MOTIVATION_LABELS[profile.motivation] : undefined),
    item('experience', 'Experiencia', profile.experience ? LEAD_EXPERIENCE_LABELS[profile.experience] : undefined),
    item('paymentMethod', 'Forma de pago', paymentMethod ? LEAD_PAYMENT_LABELS[paymentMethod] : undefined),
    item('timeline', 'Plazo', profile.timeline ? LEAD_TIMELINE_LABELS[profile.timeline] : undefined),
    item('budget', 'Presupuesto', profile.budget),
    item('lotPreference', 'Preferencia de lote', profile.lotPreference ?? answers.rangoLote),
    item('mainObjection', 'Objeción principal', profile.mainObjection),
    item('temperature', 'Temperatura', temperature ? LEAD_TEMPERATURE_LABELS[temperature] : undefined),
    item(
      'fechaLlamada',
      'Llamada agendada',
      answers.fechaLlamada ? formatCallSlotDate(new Date(answers.fechaLlamada), 'long') : undefined,
    ),
  ];
  return items.filter((row): row is LeadConversationSummaryItem => row !== null);
}
