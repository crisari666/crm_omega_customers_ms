import { interpolateTemplate } from '../../utils/interpolate-template.util';

export type LeadAgentFallbackValues = {
  readonly firstName: string;
  readonly projectTitle?: string;
};

/**
 * Fills `{{firstName}}` and `{{projectClause}}` on V2 fallback templates.
 * Empty firstName becomes "Hola" so the line never starts with a bare comma.
 */
export function renderLeadAgentFallback(template: string, values: LeadAgentFallbackValues): string {
  const trimmedName = values.firstName.trim();
  const trimmedProject = values.projectTitle?.trim() ?? '';
  return interpolateTemplate(template, {
    firstName: trimmedName.length > 0 ? trimmedName : 'Hola',
    projectClause: trimmedProject.length > 0 ? ` de ${trimmedProject}` : '',
  });
}
