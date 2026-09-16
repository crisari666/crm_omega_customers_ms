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
  maxPoints: number;
  pointsEarned: number;
  rationale?: string;
  evidence?: string;
};

export type CallAuditSpeakerTurn = {
  role: CallAuditSpeakerRole;
  text: string;
  startMs?: number;
  endMs?: number;
  speakerLabel?: string;
};

export type CallAuditLlmAnalysisResult = {
  speakerTurns?: CallAuditSpeakerTurn[];
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
  totalScore: number;
  maxScore: number;
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
  utterances?: Array<{
    speaker?: string;
    text?: string;
    start?: number;
    end?: number;
  }>;
  human: CallAuditRecordDto | null;
  ai: CallAuditRecordDto | null;
};

export type CallAuditIndicatorsSummaryDto = {
  passed: number;
  total: number;
  failedLabels: string[];
  earnedPoints: number;
  maxPoints: number;
  scorePercent: number;
};

export type CallAuditResultItemDto = {
  callLogId: string;
  callSid: string;
  agentExternalRef: string;
  completedAt?: string;
  auditorUserId: string;
  reviewerNotes?: string;
  interestScore: number;
  totalScore: number;
  maxScore: number;
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
  hasTranscript: boolean;
  aiStatus: 'none' | 'pending' | 'completed' | 'failed';
  ai: CallAuditRecordDto | null;
};

export type CallAuditAiReviewSummaryDto = {
  dateBasis: 'callCompletedAt';
  totalEligible: number;
  aiCompleted: number;
  aiPending: number;
  aiFailed: number;
  aiNone: number;
  avgInterestScore: number | null;
  avgTotalScore: number | null;
  topFailedIndicators: Array<{ label: string; count: number }>;
};

export type CallAuditAiReviewListResponseDto = {
  month: string;
  items: CallAuditAiReviewItemDto[];
  total: number;
  skip: number;
  limit: number;
  summary: CallAuditAiReviewSummaryDto;
};
