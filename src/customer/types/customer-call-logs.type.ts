import { CustomerCallUtterance } from '../schemas/customer-call-log.schema';
import type { ResolvedCallOutcome } from '../utils/call-log-outcome.util';

export type CustomerCallLogAdminEventDto = {
  eventType: string;
  timestamp: string;
  status?: string;
  durationSeconds?: number;
  recordingUrl?: string;
  transcript?: string;
  metadata?: Record<string, unknown>;
};

export type CustomerCallLogAdminItemDto = {
  id: string;
  callSid: string;
  utterances?: CustomerCallUtterance[];
  provider: string;
  /** Derived channel for UI: Meet vs Twilio VoIP. */
  channel: 'voip' | 'meet';
  googleMeetUrl?: string;
  from?: string;
  to?: string;
  direction?: string;
  durationSeconds?: number;
  recordingUrl?: string;
  transcript?: string;
  text?: string;
  status?: string;
  customerId?: string;
  customerExternalRef?: string;
  agentExternalRef?: string;
  resolvedOutcome: ResolvedCallOutcome;
  preCompleteEventType?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  events: CustomerCallLogAdminEventDto[];
};

export type IngestResult = {
  accepted: true;
  callSid: string;
  eventType: string;
  customerId?: string;
};
