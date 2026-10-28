export type VentorAssignmentCandidate = {
  readonly id: string;
  readonly name: string;
  readonly lastName: string;
  readonly phone: string;
  readonly phoneJob: string;
  /** Assigned Twilio User caller ID for VOIP; empty when none. */
  readonly voipPhone: string;
};

export type VentorLoadBalancePickResult = {
  readonly ventor: VentorAssignmentCandidate;
  readonly countsByVentorId: Record<string, number>;
  readonly windowStartIso: string;
  readonly windowEndIso: string;
};
