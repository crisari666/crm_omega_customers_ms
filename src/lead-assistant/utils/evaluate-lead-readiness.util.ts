import type { LeadReadinessItem } from '../types/lead-readiness-item.type';
import type { LeadReadinessResponse } from '../types/lead-readiness-response.type';
import type { LeadReadinessSnapshot } from '../types/lead-readiness-snapshot.type';
import { buildTemplateKey } from './build-template-key.util';

const SENSITIVE_FAQ_CATEGORIES = ['price', 'financing', 'legal'] as const;

const evaluateConnection = (snapshot: LeadReadinessSnapshot): LeadReadinessItem => {
  if (snapshot.templatesError != null) {
    return { key: 'connection', status: 'missing', detail: 'No se pudo consultar las plantillas de WhatsApp.' };
  }
  if (snapshot.configuredPhoneNumberId.trim().length === 0) {
    return { key: 'connection', status: 'missing', detail: 'Falta configurar el número de WhatsApp de leads.' };
  }
  if (snapshot.rpcPhoneNumberId != null && snapshot.rpcPhoneNumberId !== snapshot.configuredPhoneNumberId) {
    return {
      key: 'connection',
      status: 'attention',
      detail: 'El número del servicio de WhatsApp no coincide con el configurado.',
    };
  }
  return { key: 'connection', status: 'ready', detail: 'WhatsApp conectado.' };
};

const evaluateIdentity = (snapshot: LeadReadinessSnapshot): LeadReadinessItem => {
  const { settings } = snapshot;
  const hasIdentity = [settings.assistantName, settings.businessName, settings.greeting].every(
    (value) => (value ?? '').trim().length > 0,
  );
  if (!hasIdentity || settings.welcomeTemplate == null) {
    return { key: 'identity', status: 'missing', detail: 'Completa nombre, negocio, saludo y plantilla de bienvenida.' };
  }
  const welcomeKey = buildTemplateKey(settings.welcomeTemplate.name, settings.welcomeTemplate.language);
  if (!snapshot.approvedTemplateKeys.has(welcomeKey)) {
    return {
      key: 'identity',
      status: 'attention',
      detail: 'La plantilla de bienvenida no está entre las plantillas aprobadas.',
    };
  }
  return { key: 'identity', status: 'ready', detail: 'Identidad del asistente completa.' };
};

const evaluateKnowledge = (snapshot: LeadReadinessSnapshot): LeadReadinessItem => {
  if (snapshot.enabledFaqCount === 0) {
    return { key: 'knowledge', status: 'missing', detail: 'No hay preguntas frecuentes activas.' };
  }
  const missingCategories = SENSITIVE_FAQ_CATEGORIES.filter((category) => !snapshot.enabledFaqCategories.has(category));
  if (missingCategories.length > 0) {
    return {
      key: 'knowledge',
      status: 'attention',
      detail: `Faltan preguntas activas de: ${missingCategories.join(', ')}.`,
    };
  }
  return { key: 'knowledge', status: 'ready', detail: `${snapshot.enabledFaqCount} preguntas frecuentes activas.` };
};

const evaluateRecovery = (snapshot: LeadReadinessSnapshot): LeadReadinessItem => {
  const enabledSteps = snapshot.steps.filter((step) => step.enabled);
  if (enabledSteps.length === 0) {
    return { key: 'recovery', status: 'attention', detail: 'No hay pasos de recuperación activos.' };
  }
  const hasUnapprovedTemplate = enabledSteps.some(
    (step) => !snapshot.approvedTemplateKeys.has(buildTemplateKey(step.template.name, step.template.language)),
  );
  if (hasUnapprovedTemplate) {
    return {
      key: 'recovery',
      status: 'attention',
      detail: 'Un paso de recuperación usa una plantilla que no está aprobada.',
    };
  }
  return { key: 'recovery', status: 'ready', detail: `${enabledSteps.length} pasos de recuperación activos.` };
};

const evaluateActivation = (snapshot: LeadReadinessSnapshot): LeadReadinessItem => {
  if (!snapshot.settings.enabled) {
    return { key: 'activation', status: 'attention', detail: 'El asistente está desactivado.' };
  }
  if (!snapshot.hasEnabledV2Form) {
    return {
      key: 'activation',
      status: 'attention',
      detail: 'Ningún formulario activo usa el flujo del asistente (V2).',
    };
  }
  return { key: 'activation', status: 'ready', detail: 'El asistente está activo en al menos un formulario.' };
};

/** Applies the readiness rules of the five checklist items to the gathered facts. */
export function evaluateLeadReadiness(snapshot: LeadReadinessSnapshot): LeadReadinessResponse {
  const items = [
    evaluateConnection(snapshot),
    evaluateIdentity(snapshot),
    evaluateKnowledge(snapshot),
    evaluateRecovery(snapshot),
    evaluateActivation(snapshot),
  ];
  return {
    items,
    readyCount: items.filter((item) => item.status === 'ready').length,
    total: items.length,
  };
}
