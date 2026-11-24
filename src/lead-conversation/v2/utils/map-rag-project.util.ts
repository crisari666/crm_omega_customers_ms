import type { LeadProjectLotOption } from '../../types/lead-project.type';
import type { ProjectKnowledge } from '../types/project-knowledge.type';
import type { RagProjectRow } from '../types/rag-project-row.type';
import { buildProjectFinancing } from './build-project-financing.util';
import { mapRagAmenities } from './map-rag-amenities.util';

type RagProjectMedia = {
  readonly planeUrl?: string;
  readonly brochureUrl?: string;
  readonly videoUrl?: string;
};

const toText = (value: string | undefined): string => (value ?? '').trim();

const mapLotOptions = (rows: RagProjectRow['lotOptions']): LeadProjectLotOption[] =>
  (rows ?? [])
    .filter((row) => typeof row.area === 'number' && typeof row.price === 'number')
    .map((row) => ({ area: row.area as number, price: row.price as number }));

const withDefined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

/**
 * Maps an omega_rag project document into customer-safe knowledge.
 * Only whitelisted fields are copied, so commission, ventor and lot holder data can never leak.
 * Returns null when the row has no id or title.
 */
export function mapRagProject(row: RagProjectRow, media: RagProjectMedia): ProjectKnowledge | null {
  const id = String(row._id ?? row.id ?? '').trim();
  const title = toText(row.title);
  if (id.length === 0 || title.length === 0) return null;
  const lotOptions = mapLotOptions(row.lotOptions);
  const financing = buildProjectFinancing({
    lotOptions: row.lotOptions,
    separation: typeof row.separation === 'number' ? row.separation : undefined,
    maxInstallments: typeof row.maxInstallments === 'number' ? row.maxInstallments : undefined,
  });
  return withDefined({
    id,
    title,
    shortDescription: toText(row.shortDescription),
    description: toText(row.description),
    location: toText(row.location),
    city: toText(row.city),
    state: toText(row.state),
    priceSell: typeof row.priceSell === 'number' ? row.priceSell : undefined,
    lotOptions,
    amenitiesGroups: mapRagAmenities(row),
    financing,
    planeUrl: media.planeUrl,
    brochureUrl: media.brochureUrl,
    videoUrl: media.videoUrl,
  });
}
