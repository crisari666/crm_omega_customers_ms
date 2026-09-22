import { BBQ_ASADO_FORM_NAME_PREFIX } from '../constants/bbq-asado-notification.constants';

/**
 * Returns true when Meta lead form name matches Formulario_Asado prefix.
 */
export function isBbqAsadoFormName(formName: string | undefined): boolean {
  const normalized = (formName ?? '').trim().toLowerCase();
  return normalized.startsWith(BBQ_ASADO_FORM_NAME_PREFIX);
}
