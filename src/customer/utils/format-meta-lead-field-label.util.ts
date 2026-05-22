/**
 * Turns Meta lead field keys (often snake_case) into display labels.
 */
export function formatMetaLeadFieldLabel(fieldKey: string): string {
  return fieldKey.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Builds ordered label/value rows from persisted mappedFields.
 */
export function buildMetaLeadMappedFieldItems(
  mappedFields: Record<string, string>,
): { label: string; value: string }[] {
  return Object.entries(mappedFields)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([key, value]) => ({
      label: formatMetaLeadFieldLabel(key),
      value: value.trim(),
    }));
}
