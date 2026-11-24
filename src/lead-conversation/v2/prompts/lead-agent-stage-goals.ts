import type { LeadProfileStage } from '../../types/lead-profile.type';

const OPENING_WITH_PROJECT =
  'Saluda con el saludo configurado, nombra el proyecto conocido del contexto y confirma si es ese el que le interesa (o si mira otro del catálogo). Una sola pregunta. No des precios, no envíes archivos y no ofrezcas llamada.';

const OPENING_WITHOUT_PROJECT =
  'Saluda con el saludo configurado y pregunta de forma breve qué proyecto le interesa. No enumeres nombres del catalog: después de tu mensaje el sistema envía un selector de WhatsApp. Una sola pregunta. No pases a motivación, precios, archivos ni llamada hasta tener proyecto confirmado.';

const OPENING_WITH_SUGGESTION =
  'Saluda con el saludo configurado. Puedes mencionar de forma suave el suggestedProject (anuncio) y preguntar si sigue con ese o mira otro. No enumeres el catalog: el selector de WhatsApp sigue a tu mensaje. Una sola pregunta. No trates suggestedProject como confirmado: needsProject sigue true hasta que el cliente confirme en el selector o elijas un projectId del catalog. No des precios, no envíes archivos y no ofrezcas llamada.';

const STAGE_GOALS: Readonly<Record<Exclude<LeadProfileStage, 'opening'>, string>> = {
  discovery:
    'Ya hay proyecto. Si needsMotivation es true, no escribas la pregunta de motivación en el texto: el sistema envía botones de WhatsApp con construir/inversión/explorando; solo una frase puente corta si hace falta. Luego, de a una pregunta por turno, forma de pago y para cuándo lo quiere. Nunca uses offer_call_slots en esta etapa.',
  value:
    'Muestra los beneficios del proyecto que encajan con su perfil. Puedes enviar un video corto o el plano. No ofrezcas llamada si canOfferCall es false.',
  bridge:
    'Si canOfferCall es true, propón con calidez una llamada corta con un asesor (sin presión) y pregunta si le queda mejor mañana, tarde o noche. No digas "elige de la lista". Si canOfferCall es false (solo explorando o sin motivación), no ofrezcas llamada: aporta valor y vuelve a preguntar si quiere construir o invertir.',
  booking:
    'El cliente puede estar eligiendo horario. Si pregunta algo de contenido o una faq, responde con calidez y hechos primero; action continue. No uses frases tipo "solo elige una opción de la lista". Solo si ya tenía la lista y sigue sin elegir, un recordatorio suave opcional. No vuelvas a offer_call_slots por una duda de conocimiento.',
  booked:
    'La llamada ya está agendada. Responde dudas en breve con las faqs, con tono cercano. Los cambios de horario los gestiona el asesor.',
};

/**
 * Goal of each conversation stage, injected in the agent context as `stageGoal`.
 * Opening depends on whether the lead already has a confirmed project (or only a soft suggestion).
 */
export function resolveLeadAgentStageGoal(
  stage: LeadProfileStage,
  hasProject: boolean,
  hasSuggestedProject = false,
): string {
  if (stage === 'opening') {
    if (hasProject) {
      return OPENING_WITH_PROJECT;
    }
    if (hasSuggestedProject) {
      return OPENING_WITH_SUGGESTION;
    }
    return OPENING_WITHOUT_PROJECT;
  }
  return STAGE_GOALS[stage];
}

/** @deprecated Prefer {@link resolveLeadAgentStageGoal}; kept for specs that assert static discovery text. */
export const LEAD_AGENT_STAGE_GOALS: Readonly<Record<LeadProfileStage, string>> = {
  opening: OPENING_WITH_PROJECT,
  ...STAGE_GOALS,
};
