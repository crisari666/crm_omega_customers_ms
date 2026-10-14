import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PROJECT_CATALOG_TTL_MS } from './constants/lead-conversation.constants';
import type { LeadProject, LeadProjectLotOption } from './types/lead-project.type';

type RagProjectRow = {
  readonly _id?: string;
  readonly id?: string;
  readonly title?: string;
  readonly shortDescription?: string;
  readonly description?: string;
  readonly plane?: string;
  readonly lotOptions?: readonly { area?: number; price?: number }[];
};

const RAG_PROJECTS_UPLOADS_PATH = '/rag/uploads/projects/';
const MOCK_PLANE_URL = 'https://back.laceiba.group/rag/uploads//projects/plane_riviera_beach_house_cartagena.pdf';

/**
 * In-memory cache of enabled omega_rag projects (titles, plan file, lot options).
 * Refreshes after {@link PROJECT_CATALOG_TTL_MS}; keeps the stale copy when omega_rag is unreachable.
 */
@Injectable()
export class ProjectCatalogService {
  private readonly logger = new Logger(ProjectCatalogService.name);
  private projects: readonly LeadProject[] = [];
  private loadedAt = 0;

  constructor(private readonly configService: ConfigService) {}

  async getProjects(): Promise<readonly LeadProject[]> {
    const isExpired = Date.now() - this.loadedAt > PROJECT_CATALOG_TTL_MS;
    if (this.projects.length === 0 || isExpired) {
      await this.executeRefresh();
    }
    return this.projects;
  }

  async findProjectById(projectId: string): Promise<LeadProject | undefined> {
    const projects = await this.getProjects();
    return projects.find((project) => project.id === projectId);
  }

  /**
   * Public URL of the project plan file served by omega_rag static uploads.
   * Without `RAG_PUBLIC_URL` (local/dev) Meta cannot reach omega_rag, so a fixed sample plan is sent instead.
   */
  buildPlaneUrl(project: LeadProject): string | undefined {
    const base = this.configService.get<string>('leadConversation.ragPublicUrl', '').replace(/\/$/, '');
    if (!base) return MOCK_PLANE_URL;
    if (!project.plane) return undefined;
    return `${base}${RAG_PROJECTS_UPLOADS_PATH}${encodeURIComponent(project.plane)}`;
  }

  /** Empty results are not cached so the next call retries omega_rag. */
  private async executeRefresh(): Promise<void> {
    const base = this.configService.get<string>('leadConversation.ragUrl', '').replace(/\/$/, '');
    try {
      const response = await fetch(`${base}/rag/projects?enable=true`);
      if (!response.ok) {
        this.logger.warn(`omega_rag projects HTTP ${response.status}`);
        return;
      }
      const rows = (await response.json()) as RagProjectRow[];
      const projects = (Array.isArray(rows) ? rows : []).map(mapRagProject).filter((row) => row.id && row.title);
      if (projects.length === 0) {
        this.logger.warn(`omega_rag returned 0 enabled projects (${base}/rag/projects?enable=true)`);
        return;
      }
      this.projects = projects;
      this.loadedAt = Date.now();
      this.logger.log(`Project catalog refreshed (${this.projects.length} projects)`);
    } catch (err) {
      this.logger.warn(`omega_rag projects fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function mapLotOptions(rows: RagProjectRow['lotOptions']): LeadProjectLotOption[] {
  return (rows ?? [])
    .filter((row) => typeof row.area === 'number' && typeof row.price === 'number')
    .map((row) => ({ area: row.area as number, price: row.price as number }));
}

function mapRagProject(row: RagProjectRow): LeadProject {
  return {
    id: String(row._id ?? row.id ?? ''),
    title: (row.title ?? '').trim(),
    shortDescription: (row.shortDescription ?? '').trim(),
    plane: (row.plane ?? '').trim(),
    lotOptions: mapLotOptions(row.lotOptions),
  };
}
