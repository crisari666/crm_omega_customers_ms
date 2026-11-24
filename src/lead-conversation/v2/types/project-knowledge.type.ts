import type { LeadProjectLotOption } from '../../types/lead-project.type';
import type { ProjectAmenityGroupKnowledge } from './project-amenity-group-knowledge.type';
import type { ProjectLotCountsKnowledge } from './project-lot-counts-knowledge.type';

/**
 * Customer-safe project facts handed to the agent.
 * Never contains commission data, ventor names or lot holders.
 */
export type ProjectKnowledge = {
  readonly id: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly description: string;
  readonly location: string;
  readonly city: string;
  readonly state: string;
  readonly priceSell?: number;
  readonly lotOptions: readonly LeadProjectLotOption[];
  readonly amenitiesGroups: readonly ProjectAmenityGroupKnowledge[];
  /** Real lot counts; absent when omega_rag lots are unreachable (never invented). */
  readonly lotCounts?: ProjectLotCountsKnowledge;
  readonly planeUrl?: string;
  readonly brochureUrl?: string;
  /** First of `reelVideos`, then `verticalVideos`. */
  readonly videoUrl?: string;
};
