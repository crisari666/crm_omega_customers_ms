import { Injectable } from '@nestjs/common';
import { ProjectCatalogService } from './project-catalog.service';
import { ProjectClassifierLlmService } from './project-classifier-llm.service';
import type { LeadProject } from './types/lead-project.type';
import { matchProjectByText } from './utils/match-project-by-text.util';
import { normalizeLeadText } from './utils/normalize-lead-text.util';

const GREETING_ONLY_REGEX =
  /^(hola|ola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|info|informacion|hi|hello|quiero informacion|mas informacion)$/;
const MIN_CLASSIFIABLE_LENGTH = 4;

const isGreetingOnly = (text: string): boolean => {
  const normalized = normalizeLeadText(text);
  return normalized.length < MIN_CLASSIFIABLE_LENGTH || GREETING_ONLY_REGEX.test(normalized);
};

/** Hybrid project detection: deterministic fuzzy match first, OpenAI classifier as fallback. */
@Injectable()
export class ProjectMatcherService {
  constructor(
    private readonly projectCatalog: ProjectCatalogService,
    private readonly classifier: ProjectClassifierLlmService,
  ) {}

  async findProjectInText(text: string): Promise<LeadProject | undefined> {
    const projects = await this.projectCatalog.getProjects();
    const fuzzyMatch = matchProjectByText(text, projects);
    if (fuzzyMatch !== undefined) return fuzzyMatch;
    if (isGreetingOnly(text)) return undefined;
    const projectId = await this.classifier.classifyProjectId(text, projects);
    return projectId === null ? undefined : projects.find((project) => project.id === projectId);
  }
}
