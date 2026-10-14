import type { LeadProject } from '../types/lead-project.type';
import { normalizeLeadText } from './normalize-lead-text.util';

const STOP_WORDS: ReadonlySet<string> = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'proyecto']);
const MIN_TOKEN_OVERLAP_RATIO = 0.5;

const toSignificantTokens = (value: string): string[] =>
  normalizeLeadText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

function computeProjectMatchScore(text: string, project: LeadProject): number {
  const normalizedTitle = normalizeLeadText(project.title);
  if (normalizedTitle !== '' && ` ${text} `.includes(` ${normalizedTitle} `)) return 1;
  const titleTokens = toSignificantTokens(project.title);
  if (titleTokens.length === 0) return 0;
  const textTokens = new Set(text.split(' '));
  const matched = titleTokens.filter((token) => textTokens.has(token)).length;
  return matched / titleTokens.length;
}

/**
 * Deterministic project detection: full-title containment or token overlap ≥ 50%.
 * Returns undefined when nothing matches or the best score is tied (ambiguous).
 */
export function matchProjectByText(rawText: string, projects: readonly LeadProject[]): LeadProject | undefined {
  const text = normalizeLeadText(rawText);
  if (text === '') return undefined;
  const scored = projects
    .map((project) => ({ project, score: computeProjectMatchScore(text, project) }))
    .filter((row) => row.score >= MIN_TOKEN_OVERLAP_RATIO)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return undefined;
  if (scored.length > 1 && scored[0].score === scored[1].score) return undefined;
  return scored[0].project;
}
