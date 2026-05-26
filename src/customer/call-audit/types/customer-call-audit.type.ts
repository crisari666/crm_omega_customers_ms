import type {
  CallAuditSource,
  CallAuditSpeakerRole,
  CallAuditStatus,
} from '../constants/call-audit.constant';
import type { CallAuditLlmIndicatorConfig } from '../config/call-audit-llm.config';

export type CallAuditIndicatorResult = {
  key: string;
  label: string;
  passed: boolean;
  rationale?: string;
  evidence?: string;
};

export type CallAuditSpeakerTurn = {
  role: CallAuditSpeakerRole;
  text: string;
};

export type CallAuditLlmAnalysisResult = {
  speakerTurns: CallAuditSpeakerTurn[];
  indicators: Array<{
    key: string;
    passed: boolean;
    rationale?: string;
    evidence?: string;
  }>;
  interestScore: number;
  interestScoreRationale?: string;
};

export type CallAuditRecordDto = {
  id: string;
  callLogId: string;
  callSid: string;
  agentExternalRef: string;
  source: CallAuditSource;
  configVersion: string;
  indicators: CallAuditIndicatorResult[];
  interestScore: number;
  interestScoreRationale?: string;
  speakerTurns?: CallAuditSpeakerTurn[];
  auditorUserId?: string;
  reviewerNotes?: string;
  status: CallAuditStatus;
  llmModel?: string;
  llmError?: string;
  analyzedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CallAuditConfigPublicDto = {
  configVersion: string;
  indicators: readonly CallAuditLlmIndicatorConfig[];
  interestScore: {
    min: number;
    max: number;
    labels: Readonly<Record<number, string>>;
  };
  requiredHumanAuditsPerMonth: number;
};

export type CallAuditsByCallResponseDto = {
  callLogId: string;
  callSid: string;
  agentExternalRef?: string;
  transcript?: string;
  resolvedOutcome?: string;
  durationSeconds?: number;
  human: CallAuditRecordDto | null;
  ai: CallAuditRecordDto | null;
};

export type CallAuditProgressAgentRowDto = {
  agentExternalRef: string;
  humanAuditCount: number;
  required: number;
  pendingCallLogIds: string[];
};

export type CallAuditProgressResponseDto = {
  month: string;
  required: number;
  agents: CallAuditProgressAgentRowDto[];
};

export type CallAuditAiReviewItemDto = {
  callLogId: string;
  callSid: string;
  agentExternalRef: string;
  completedAt?: string;
  durationSeconds?: number;
  aiStatus: 'none' | 'pending' | 'completed' | 'failed';
  ai: CallAuditRecordDto | null;
};

export type CallAuditAiReviewListResponseDto = {
  month: string;
  items: CallAuditAiReviewItemDto[];
  total: number;
  skip: number;
  limit: number;
};
