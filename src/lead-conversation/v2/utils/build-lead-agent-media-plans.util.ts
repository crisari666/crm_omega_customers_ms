import { LEAD_AGENT_REPLY_GAP_MS } from '../../constants/lead-conversation.constants';
import type { OutboundMessagePlan } from '../../types/outbound-message-plan.type';
import type { LeadAgentMediaPlans } from '../types/lead-agent-media-plans.type';
import type { LeadAgentMediaKind } from '../types/lead-agent-media-kind.type';
import type { ProjectKnowledge } from '../types/project-knowledge.type';

const PDF_EXTENSION_REGEX = /\.pdf$/i;

const buildMediaPlan = (kind: LeadAgentMediaKind, project: ProjectKnowledge): OutboundMessagePlan | undefined => {
  if (kind === 'video' && project.videoUrl !== undefined) {
    return { kind: 'video', mediaUrl: project.videoUrl, body: `Video de ${project.title}`, delayMs: LEAD_AGENT_REPLY_GAP_MS };
  }
  if (kind === 'brochure' && project.brochureUrl !== undefined) {
    return {
      kind: 'document',
      mediaUrl: project.brochureUrl,
      body: `Brochure de ${project.title}`,
      fileName: `Brochure ${project.title}.pdf`,
      delayMs: LEAD_AGENT_REPLY_GAP_MS,
    };
  }
  if (kind !== 'plan' || project.planeUrl === undefined) return undefined;
  const isPdf = PDF_EXTENSION_REGEX.test(project.planeUrl);
  return {
    kind: isPdf ? 'document' : 'image',
    mediaUrl: project.planeUrl,
    body: `Plano de ${project.title}`,
    ...(isPdf ? { fileName: `Plano ${project.title}.pdf` } : {}),
    delayMs: LEAD_AGENT_REPLY_GAP_MS,
  };
};

/**
 * One outbound plan per requested medium that the project has and that was not sent before.
 * Video goes as `video`, the plan as `document` (PDF) or `image`, the brochure as `document`.
 */
export function buildLeadAgentMediaPlans(
  requested: readonly LeadAgentMediaKind[],
  project: ProjectKnowledge | undefined,
  sentMedia: readonly LeadAgentMediaKind[],
): LeadAgentMediaPlans {
  if (project === undefined) return { plans: [], sent: [] };
  const pending = requested.filter((kind) => !sentMedia.includes(kind));
  const built = pending.map((kind) => ({ kind, plan: buildMediaPlan(kind, project) }));
  const available = built.filter((entry) => entry.plan !== undefined);
  return {
    plans: available.map((entry) => entry.plan as OutboundMessagePlan),
    sent: available.map((entry) => entry.kind),
  };
}
