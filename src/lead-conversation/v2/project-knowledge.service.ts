import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PROJECT_CATALOG_TTL_MS } from '../constants/lead-conversation.constants';
import { ProjectCatalogService } from '../project-catalog.service';
import { PROJECT_LOTS_TTL_MS } from './constants/lead-agent.constants';
import type { ProjectCatalogSummaryItem } from './types/project-catalog-summary-item.type';
import type { ProjectKnowledge } from './types/project-knowledge.type';
import type { ProjectLotCountsKnowledge } from './types/project-lot-counts-knowledge.type';
import type { RagProjectRow } from './types/rag-project-row.type';
import { mapRagProject } from './utils/map-rag-project.util';

type CachedLotCounts = {
  readonly counts: ProjectLotCountsKnowledge;
  readonly loadedAt: number;
};

type RagLotsPublicResponse = {
  readonly summary?: {
    readonly lot?: { readonly available?: number; readonly sold?: number; readonly total?: number };
  };
};

const RAG_PROJECTS_UPLOADS_PATH = '/rag/uploads/projects/';

const toCount = (value: number | undefined): number => (typeof value === 'number' && value >= 0 ? value : 0);

/**
 * Customer-safe project facts for the V2 agent, read from omega_rag.
 * Projects are cached 10 minutes and lot counts 5 minutes; stale copies are kept when omega_rag is unreachable.
 */
@Injectable()
export class ProjectKnowledgeService {
  private readonly logger = new Logger(ProjectKnowledgeService.name);
  private projects: readonly ProjectKnowledge[] = [];
  private loadedAt = 0;
  private readonly lotCounts = new Map<string, CachedLotCounts>();

  constructor(
    private readonly configService: ConfigService,
    private readonly projectCatalog: ProjectCatalogService,
  ) {}

  /** Enabled projects (without lot counts, which are fetched per project by {@link executeGetById}). */
  async executeGetAll(): Promise<readonly ProjectKnowledge[]> {
    const isExpired = Date.now() - this.loadedAt > PROJECT_CATALOG_TTL_MS;
    if (this.projects.length === 0 || isExpired) {
      await this.executeRefreshProjects();
    }
    return this.projects;
  }

  /** One project with its real lot counts when omega_rag exposes them. */
  async executeGetById(projectId: string): Promise<ProjectKnowledge | undefined> {
    const projects = await this.executeGetAll();
    const project = projects.find((candidate) => candidate.id === projectId);
    if (project === undefined) return undefined;
    const lotCounts = await this.executeGetLotCounts(projectId);
    return lotCounts === undefined ? project : { ...project, lotCounts };
  }

  /** `{ id, title, location, priceFrom }` per project, used by the prompt while the lead has no project. */
  async executeGetCatalogSummary(): Promise<ProjectCatalogSummaryItem[]> {
    const projects = await this.executeGetAll();
    return projects.map((project) => this.buildSummaryItem(project));
  }

  private buildSummaryItem(project: ProjectKnowledge): ProjectCatalogSummaryItem {
    const prices = project.lotOptions.map((option) => option.price);
    const priceFrom = prices.length > 0 ? Math.min(...prices) : project.priceSell;
    return {
      id: project.id,
      title: project.title,
      location: project.location,
      ...(priceFrom !== undefined ? { priceFrom } : {}),
    };
  }

  private async executeGetLotCounts(projectId: string): Promise<ProjectLotCountsKnowledge | undefined> {
    const cached = this.lotCounts.get(projectId);
    if (cached !== undefined && Date.now() - cached.loadedAt <= PROJECT_LOTS_TTL_MS) {
      return cached.counts;
    }
    const fresh = await this.fetchLotCounts(projectId);
    if (fresh === undefined) return cached?.counts;
    this.lotCounts.set(projectId, { counts: fresh, loadedAt: Date.now() });
    return fresh;
  }

  private async fetchLotCounts(projectId: string): Promise<ProjectLotCountsKnowledge | undefined> {
    const url = `${this.resolveRagUrl()}/rag/projects/${encodeURIComponent(projectId)}/lots/public`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`omega_rag lots HTTP ${response.status} (${projectId})`);
        return undefined;
      }
      const lot = ((await response.json()) as RagLotsPublicResponse).summary?.lot;
      if (lot === undefined) return undefined;
      return { available: toCount(lot.available), sold: toCount(lot.sold), total: toCount(lot.total) };
    } catch (err) {
      this.logger.warn(`omega_rag lots fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  /** Empty results are not cached so the next call retries omega_rag. */
  private async executeRefreshProjects(): Promise<void> {
    const url = this.buildProjectsUrl();
    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`omega_rag projects HTTP ${response.status}`);
        return;
      }
      const rows = (await response.json()) as RagProjectRow[];
      const projects = (Array.isArray(rows) ? rows : [])
        .map((row) => mapRagProject(row, this.buildMedia(row)))
        .filter((project): project is ProjectKnowledge => project !== null);
      if (projects.length === 0) {
        this.logger.warn(`omega_rag returned 0 enabled projects (${url})`);
        return;
      }
      this.projects = projects;
      this.loadedAt = Date.now();
    } catch (err) {
      this.logger.warn(`omega_rag projects fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private buildProjectsUrl(): string {
    const distribution = this.configService
      .get<string>('leadConversation.ragProjectsDistribution', '')
      .trim()
      .toLowerCase();
    const distributionQuery = distribution === 'external' || distribution === 'internal' ? `&distribution=${distribution}` : '';
    return `${this.resolveRagUrl()}/rag/projects?enable=true${distributionQuery}`;
  }

  private resolveRagUrl(): string {
    return this.configService.get<string>('leadConversation.ragUrl', '').replace(/\/$/, '');
  }

  /** Same rule as `ProjectCatalogService.buildPlaneUrl`; without `RAG_PUBLIC_URL` only the sample plan is available. */
  private buildMedia(row: RagProjectRow): { planeUrl?: string; brochureUrl?: string; videoUrl?: string } {
    const planeUrl = this.projectCatalog.buildPlaneUrl({
      id: '',
      title: '',
      shortDescription: '',
      plane: (row.plane ?? '').trim(),
      lotOptions: [],
    });
    const base = this.configService.get<string>('leadConversation.ragPublicUrl', '').replace(/\/$/, '');
    if (base === '') return { ...(planeUrl !== undefined ? { planeUrl } : {}) };
    const video = [...(row.reelVideos ?? []), ...(row.verticalVideos ?? [])].find((file) => file.trim().length > 0);
    const brochureUrl = this.buildUploadUrl(base, row.brochure);
    const videoUrl = this.buildUploadUrl(base, video);
    return {
      ...(planeUrl !== undefined ? { planeUrl } : {}),
      ...(brochureUrl !== undefined ? { brochureUrl } : {}),
      ...(videoUrl !== undefined ? { videoUrl } : {}),
    };
  }

  private buildUploadUrl(base: string, filename: string | undefined): string | undefined {
    const trimmed = (filename ?? '').trim();
    return trimmed.length === 0 ? undefined : `${base}${RAG_PROJECTS_UPLOADS_PATH}${encodeURIComponent(trimmed)}`;
  }
}
