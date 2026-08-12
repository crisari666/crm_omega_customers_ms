import type { CustomerDownPaymentStatus } from '../schemas/customer-down-payment.schema';

export type CustomerPaymentFeeResponse = {
  id: string;
  downPaymentId: string;
  customerId: string;
  projectId: string;
  paymentValue: number;
  datePayment: string;
  receiptNumber?: string;
  paymentMethod?: string;
  notes?: string;
  recordedBy: string;
  hasEvidence: boolean;
  evidenceMimeType?: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDownPaymentResponse = {
  id: string;
  customerId: string;
  projectId: string;
  lotNumber: string;
  expectedValue: number;
  status: CustomerDownPaymentStatus;
  totalPaid: number;
  feeCount: number;
  remaining: number;
  customerName?: string;
  projectName?: string;
  recordedBy: string;
  hasContract: boolean;
  contractMimeType?: string;
  createdAt: string;
  updatedAt: string;
  fees?: CustomerPaymentFeeResponse[];
};

export type ListCustomerDownPaymentsResult = {
  data: CustomerDownPaymentResponse[];
  total: number;
};
