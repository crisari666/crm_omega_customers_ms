/**
 * Admin staff performance report (physical office users × customers-ms data).
 */
export type CustomerStaffPerformanceReportDto = {
  readonly assignedFrom: string;
  readonly assignedTo: string;
  readonly stepsMeta: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly order: number;
  }>;
  readonly rows: ReadonlyArray<{
    readonly userId: string;
    readonly displayName: string;
    readonly totalAssignedInRange: number;
    readonly calls: {
      readonly totalCalls: number;
      readonly answered: number;
      readonly dontAnswered: number;
      readonly failed: number;
    };
    readonly attendedCount: number;
    readonly unattendedCount: number;
    readonly avgTimeToAttendMs: number | null;
    readonly steps: Readonly<Record<string, number>>;
  }>;
};
