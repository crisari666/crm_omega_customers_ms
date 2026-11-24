import type { LeadSessionSnapshot } from '../../lead-conversation-session.service';
import type { LeadFlowVersion } from '../../types/lead-flow-version.type';

/** Flow chosen for an inbound message plus the (possibly converted) session snapshot. */
export type LeadFlowResolution = {
  readonly flowVersion: LeadFlowVersion;
  readonly session: LeadSessionSnapshot;
};
