export type VentorAssignmentCandidate = {
  readonly id: string;
  readonly name: string;
  readonly lastName: string;
  readonly phone: string;
  readonly phoneJob: string;
};

export type VentorLoadBalancePickResult = {
  readonly ventor: VentorAssignmentCandidate;
  readonly countsByVentorId: Record<string, number>;
  readonly windowStartIso: string;
  readonly windowEndIso: string;
};
