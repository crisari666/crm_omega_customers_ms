import type { ProjectKnowledge } from './project-knowledge.type';

/** Soft Meta-ad / interestedProjects hint — never treated as a confirmed session project. */
export type SuggestedLeadProject = {
  readonly id: string;
  readonly title: string;
};

/** Project of the current turn: already on the session, newly confirmed (LLM) or unknown. */
export type ResolvedLeadProject = {
  readonly projectId?: string;
  readonly projectTitle?: string;
  /** True when the project was not stored on the session yet and must be persisted. */
  readonly isNewlyResolved: boolean;
  /** Customer chose "Me interesan todos" — project gate satisfied, no single RAG project. */
  readonly isAllProjects?: boolean;
  /** True when this turn adopted a project (or all-projects) from an interactive tap. */
  readonly adoptedFromTap?: boolean;
  readonly knowledge?: ProjectKnowledge;
  /** Ad / CRM interest hint when the session has no confirmed project yet. */
  readonly suggestedProject?: SuggestedLeadProject;
};
