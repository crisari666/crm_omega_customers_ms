import type { LeadProfileStage } from '../../types/lead-profile.type';

const OPENING_WITH_PROJECT =
  'Ya hay proyecto confirmado: saluda tú con el saludo configurado en una sola línea (qué gusto saludarte; no preguntes cómo va el día). Confirma si sigue siendo ese el proyecto de interés (o si mira otro del catálogo). Si hay captureKnown (ciudad, capacidad), reconócelo en una frase y no lo vuelvas a preguntar. Una sola pregunta. No des precios, no envíes archivos y no ofrezcas llamada.';

const OPENING_WITHOUT_PROJECT =
  'Si systemSendsGreeting es true, no saludes (el sistema ya envió el saludo predefinido; no preguntes cómo va el día). No escribas la pregunta de proyecto en el texto: después de tu mensaje el sistema envía un selector de WhatsApp. No enumeres nombres del catalog. No pases a motivación, precios, archivos ni llamada hasta tener proyecto confirmado.';

const OPENING_WITH_SUGGESTION =
  'Si systemSendsGreeting es true, no saludes ni confirmes el proyecto en replies: el sistema ya envió el saludo predefinido con suggestedProject. Solo una frase puente corta si hace falta, o espera su respuesta. NO asumas que llega un selector: solo usa action offer_projects si pide ver otros. Si afirma el suggestedProject, pon su id en projectId. Reconoce captureKnown si existe. No des precios, no envíes archivos y no ofrezcas llamada.';

const STAGE_GOALS: Readonly<Record<Exclude<LeadProfileStage, 'opening'>, string>> = {
  discovery:
    'Ya hay proyecto. Si needsMotivation es true, no escribas la pregunta de motivación en el texto: el sistema envía botones; solo una frase puente corta si hace falta. Si la motivación de compra ya está y falta paymentMethod, no preguntes financiado/contado: el sistema envía esos botones; solo una frase puente. Tras financiado el sistema envía el selector de lotes con cuotas; tras contado o lote elegido abre la agenda. No preguntes plazo de compra (timeToBuy) antes de agendar. Reconoce captureKnown y no re-preguntes lo ya sabido. Nunca uses offer_call_slots en esta etapa.',
  value:
    'Resuelve dudas con las faqs y el conocimiento del proyecto. Si systemSendsFinancing es true y pregunta precios o cuotas, solo una frase puente (sin cifras): el sistema envía el selector de lotes con cuotas mensuales. No escribas "¿tienes otra duda?" ni invites a la llamada tras FAQ: el sistema envía esos botones. Puedes enviar un video corto o el plano. No ofrezcas llamada si canOfferCall es false.',
  bridge:
    'Si canOfferCall es true y el cliente quiere avanzar (sin más dudas, pide asesor, eligió lote o de contado), usa offer_call_slots. No digas "elige de la lista". Si canOfferCall es false (solo explorando o sin motivación), no ofrezcas llamada: aporta valor y vuelve a preguntar si quiere construir o invertir.',
  booking:
    'El cliente puede estar eligiendo horario. Si pregunta algo de contenido o una faq, responde con calidez y hechos primero; action continue. No uses frases tipo "solo elige una opción de la lista". Solo si ya tenía la lista y sigue sin elegir, un recordatorio suave opcional. No vuelvas a offer_call_slots por una duda de conocimiento.',
  booked:
    'La llamada ya está agendada. Responde dudas en breve con las faqs. Si nextCaptureField es timeToBuy, urgencyLevel o decisionMaker, no escribas esa pregunta: el sistema envía la lista o botones; solo una frase puente. Los cambios de horario los gestiona el asesor.',
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
