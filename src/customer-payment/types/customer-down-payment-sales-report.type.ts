import type { CustomerDownPaymentResponse } from './customer-down-payment.type';

export type SalesReportSummary = {
  readonly salesCount: number;
  readonly completedCount: number;
  readonly pendingCount: number;
  readonly totalExpected: number;
  readonly totalPaid: number;
  readonly totalRemaining: number;
  readonly completionRate: number;
};

export type SalesReportByAgentItem = {
  readonly recordedBy: string;
  readonly salesCount: number;
  readonly completedCount: number;
  readonly totalExpected: number;
  readonly totalPaid: number;
};

export type SalesReportByProjectItem = {
  readonly projectId: string;
  readonly projectName?: string;
  readonly salesCount: number;
  readonly totalExpected: number;
  readonly totalPaid: number;
};

export type SalesReportByDayItem = {
  readonly date: string;
  readonly salesCount: number;
  readonly totalExpected: number;
  readonly totalPaid: number;
};

export type CustomerDownPaymentSalesReportResult = {
  readonly summary: SalesReportSummary;
  readonly byAgent: SalesReportByAgentItem[];
  readonly byProject: SalesReportByProjectItem[];
  readonly byDay: SalesReportByDayItem[];
  readonly rows: CustomerDownPaymentResponse[];
  readonly total: number;
};
