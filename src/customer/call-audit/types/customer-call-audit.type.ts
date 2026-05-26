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

export type CallAuditIndicatorsSummaryDto = {
  passed: number;
  total: number;
  failedLabels: string[];
};

export type CallAuditResultItemDto = {
  callLogId: string;
  callSid: string;
  agentExternalRef: string;
  completedAt?: string;
  auditorUserId: string;
  reviewerNotes?: string;
  interestScore: number;
  indicatorsSummary: CallAuditIndicatorsSummaryDto;
  analyzedAt?: string;
};

export type CallAuditResultsResponseDto = {
  month: string;
  items: CallAuditResultItemDto[];
};

export type CallAuditAuditorProgressRowDto = {
  auditorUserId: string;
  humanAuditCount: number;
};

export type CallAuditAuditorProgressResponseDto = {
  month: string;
  required: number;
  auditors: CallAuditAuditorProgressRowDto[];
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
