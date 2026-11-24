import {
  LEAD_AGENT_ACTIONS,
  LEAD_AGENT_CALL_PERIODS,
  LEAD_AGENT_EXPERIENCES,
  LEAD_AGENT_INTENTS,
  LEAD_AGENT_MAX_PROFILE_TEXT_CHARS,
  LEAD_AGENT_MAX_REPLIES,
  LEAD_AGENT_MAX_REPLY_CHARS,
  LEAD_AGENT_MAX_UNANSWERED_CHARS,
  LEAD_AGENT_MEDIA_KINDS,
  LEAD_AGENT_MOTIVATIONS,
  LEAD_AGENT_PAYMENT_METHODS,
  LEAD_AGENT_TIMELINES,
} from '../constants/lead-agent.constants';
import type { LeadAgentLlmTurn } from '../types/lead-agent-llm-turn.type';
import type { LeadAgentTurnValidation } from '../types/lead-agent-turn-validation.type';

type RawTurn = Readonly<Record<string, unknown>>;

const cleanText = (value: unknown, maxChars: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxChars).trim() : '';

const pickEnum = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  allowed.find((candidate) => candidate === value);

const pickEnumList = <T extends string>(values: unknown, allowed: readonly T[]): T[] => {
  const picked = (Array.isArray(values) ? values : []).map((value) => pickEnum(value, allowed));
  return [...new Set(picked.filter((value): value is T => value !== undefined))];
};

const pickIds = (values: unknown, allowed: ReadonlySet<string>): string[] => {
  const ids = (Array.isArray(values) ? values : []).filter(
    (value): value is string => typeof value === 'string' && allowed.has(value),
  );
  return [...new Set(ids)];
};

const parseReplies = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
    .map((reply) => cleanText(reply, LEAD_AGENT_MAX_REPLY_CHARS))
    .filter((reply) => reply.length > 0)
    .slice(0, LEAD_AGENT_MAX_REPLIES);

const parseProfile = (value: unknown): LeadAgentLlmTurn['profile'] => {
  const raw: RawTurn = typeof value === 'object' && value !== null ? (value as RawTurn) : {};
  const budget = cleanText(raw.budget, LEAD_AGENT_MAX_PROFILE_TEXT_CHARS);
  const lotPreference = cleanText(raw.lotPreference, LEAD_AGENT_MAX_PROFILE_TEXT_CHARS);
  const mainObjection = cleanText(raw.mainObjection, LEAD_AGENT_MAX_PROFILE_TEXT_CHARS);
  const entries: [string, string | undefined][] = [
    ['motivation', pickEnum(raw.motivation, LEAD_AGENT_MOTIVATIONS)],
    ['experience', pickEnum(raw.experience, LEAD_AGENT_EXPERIENCES)],
    ['paymentMethod', pickEnum(raw.paymentMethod, LEAD_AGENT_PAYMENT_METHODS)],
    ['timeline', pickEnum(raw.timeline, LEAD_AGENT_TIMELINES)],
    ['budget', budget || undefined],
    ['lotPreference', lotPreference || undefined],
    ['mainObjection', mainObjection || undefined],
  ];
  return Object.fromEntries(entries.filter(([, entry]) => entry !== undefined)) as LeadAgentLlmTurn['profile'];
};

const parseProjectId = (value: unknown, allowed: ReadonlySet<string>): string | null =>
  typeof value === 'string' && allowed.has(value) ? value : null;

/**
 * Validates the JSON the agent LLM returned: 1 to 3 trimmed replies (max 600 characters each),
 * unknown enum values dropped, `projectId` and `usedFaqIds` kept only when they were in the prompt.
 * Returns null when the content is not a JSON object or no reply survives.
 */
export function parseLeadAgentLlmTurn(content: string, validation: LeadAgentTurnValidation): LeadAgentLlmTurn | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const raw = parsed as RawTurn;
  const replies = parseReplies(raw.replies);
  if (replies.length === 0) return null;
  return {
    replies,
    profile: parseProfile(raw.profile),
    intents: pickEnumList(raw.intents, LEAD_AGENT_INTENTS),
    action: pickEnum(raw.action, LEAD_AGENT_ACTIONS) ?? 'continue',
    media: pickEnumList(raw.media, LEAD_AGENT_MEDIA_KINDS),
    callPeriod: pickEnum(raw.callPeriod, LEAD_AGENT_CALL_PERIODS) ?? null,
    projectId: parseProjectId(raw.projectId, validation.allowedProjectIds),
    usedFaqIds: pickIds(raw.usedFaqIds, validation.allowedFaqIds),
    unansweredQuestion: cleanText(raw.unansweredQuestion, LEAD_AGENT_MAX_UNANSWERED_CHARS) || null,
  };
}
