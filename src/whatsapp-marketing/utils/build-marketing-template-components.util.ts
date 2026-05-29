export type TemplateHeaderMediaType = 'image' | 'video';

export type BuildMarketingTemplateComponentsInput = {
  readonly templateHeaderMediaId?: string | null;
  readonly templateHeaderMediaType?: TemplateHeaderMediaType | null;
  readonly templateComponents?: Record<string, unknown>[] | null;
};

function isHeaderComponent(component: Record<string, unknown>): boolean {
  return String(component.type ?? '').toLowerCase() === 'header';
}

function buildHeaderComponent(
  mediaId: string,
  mediaType: TemplateHeaderMediaType,
): Record<string, unknown> {
  const parameter =
    mediaType === 'video'
      ? { type: 'video', video: { id: mediaId } }
      : { type: 'image', image: { id: mediaId } };
  return {
    type: 'header',
    parameters: [parameter],
  };
}

/**
 * Builds Meta template `components` for marketing sends.
 * Injects header media id when configured and strips duplicate header entries from stored JSON.
 */
export function buildMarketingTemplateComponents(
  input: BuildMarketingTemplateComponentsInput,
): Record<string, unknown>[] | undefined {
  const mediaId = input.templateHeaderMediaId?.trim() ?? '';
  const mediaType: TemplateHeaderMediaType =
    input.templateHeaderMediaType === 'video' ? 'video' : 'image';
  const bodyComponents = Array.isArray(input.templateComponents)
    ? input.templateComponents.filter((component) => !isHeaderComponent(component))
    : [];
  if (mediaId === '') {
    return bodyComponents.length > 0 ? bodyComponents : undefined;
  }
  return [buildHeaderComponent(mediaId, mediaType), ...bodyComponents];
}
