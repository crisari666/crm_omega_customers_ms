/**
 * Builds Meta template body components for the lead-conversation welcome template.
 * Template body param: contact_name (named parameter).
 */
export function buildLeadFormWelcomeTemplateComponents(
  contactName: string,
): Record<string, unknown>[] {
  const trimmedName = contactName.trim().length > 0 ? contactName.trim() : 'Cliente';
  return [
    {
      type: 'body',
      parameters: [
        {
          type: 'text',
          text: trimmedName,
          parameter_name: 'contact_name',
        },
      ],
    },
  ];
}
