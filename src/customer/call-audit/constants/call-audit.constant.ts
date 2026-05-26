export const DEFAULT_REQUIRED_HUMAN_AUDITS_PER_MONTH = 3;

export const CALL_AUDIT_SOURCE_HUMAN = 'human' as const;
export const CALL_AUDIT_SOURCE_AI = 'ai' as const;

export type CallAuditSource =
  | typeof CALL_AUDIT_SOURCE_HUMAN
  | typeof CALL_AUDIT_SOURCE_AI;

export const CALL_AUDIT_STATUS_PENDING = 'pending' as const;
export const CALL_AUDIT_STATUS_COMPLETED = 'completed' as const;
export const CALL_AUDIT_STATUS_FAILED = 'failed' as const;

export type CallAuditStatus =
  | typeof CALL_AUDIT_STATUS_PENDING
  | typeof CALL_AUDIT_STATUS_COMPLETED
  | typeof CALL_AUDIT_STATUS_FAILED;

export const CALL_AUDIT_SPEAKER_AGENT = 'agent' as const;
export const CALL_AUDIT_SPEAKER_CUSTOMER = 'customer' as const;

export type CallAuditSpeakerRole =
  | typeof CALL_AUDIT_SPEAKER_AGENT
  | typeof CALL_AUDIT_SPEAKER_CUSTOMER;
