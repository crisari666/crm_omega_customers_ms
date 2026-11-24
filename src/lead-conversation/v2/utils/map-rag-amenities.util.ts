import type { ProjectAmenityGroupKnowledge } from '../types/project-amenity-group-knowledge.type';
import type { RagProjectRow } from '../types/rag-project-row.type';

const FLAT_AMENITIES_TITLE = 'Amenidades' as const;

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null;

const toCleanText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const toLabel = (value: unknown): string => (isRecord(value) ? toCleanText(value.title) : toCleanText(value));

const toLabels = (values: unknown): string[] =>
  (Array.isArray(values) ? values : []).map(toLabel).filter((label) => label.length > 0);

const mapGroup = (value: unknown): ProjectAmenityGroupKnowledge | null => {
  if (!isRecord(value)) return null;
  const title = toCleanText(value.title);
  const items = toLabels(value.amenities ?? value.items);
  return title.length > 0 && items.length > 0 ? { title, items } : null;
};

/**
 * Amenities of an omega_rag project as customer-facing groups.
 * Reads `amenitiesGroups` (`{ title, amenities }`) and falls back to the flat `amenities` list
 * (`{ _id, title }` objects or plain strings) as a single group.
 */
export function mapRagAmenities(row: Pick<RagProjectRow, 'amenities' | 'amenitiesGroups'>): ProjectAmenityGroupKnowledge[] {
  const groups = (Array.isArray(row.amenitiesGroups) ? row.amenitiesGroups : [])
    .map(mapGroup)
    .filter((group): group is ProjectAmenityGroupKnowledge => group !== null);
  if (groups.length > 0) return groups;
  const flatItems = toLabels(row.amenities);
  return flatItems.length > 0 ? [{ title: FLAT_AMENITIES_TITLE, items: flatItems }] : [];
}
