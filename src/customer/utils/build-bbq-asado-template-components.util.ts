import { BBQ_ASADO_BODY_PARAM_ORDER } from '../constants/bbq-asado-notification.constants';

/**
 * Builds Meta template body components for `bbq_27_sept_notification`.
 */
export function buildBbqAsadoTemplateComponents(contactName: string): Record<string, unknown>[] {
  const trimmedName = contactName.trim().length > 0 ? contactName.trim() : 'Cliente';
  return [
    {
      type: 'body',
      parameters: BBQ_ASADO_BODY_PARAM_ORDER.map((parameterName) => ({
        type: 'text',
        text: trimmedName,
        parameter_name: parameterName,
      })),
    },
  ];
}
