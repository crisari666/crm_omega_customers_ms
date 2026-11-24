import type { LeadSessionSnapshot } from '../../lead-conversation-session.service';
import type { LeadAgentSessionView } from '../types/lead-agent-session-view.type';

/** Projects a persisted session into the read-only view the V2 engine works on. */
export function buildLeadAgentSessionView(session: LeadSessionSnapshot): LeadAgentSessionView {
  return {
    firstName: session.firstName,
    step: session.step,
    status: session.status,
    ...(session.projectId !== undefined ? { projectId: session.projectId } : {}),
    ...(session.projectTitle !== undefined ? { projectTitle: session.projectTitle } : {}),
    ...(session.isAllProjects === true ? { isAllProjects: true } : {}),
    leadProfile: session.leadProfile ?? {},
    scoreSignals: session.scoreSignals ?? [],
    answers: session.answers ?? {},
    pendingOptions: session.pendingOptions ?? [],
    customerId: session.customerId,
  };
}
